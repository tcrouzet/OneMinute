#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mapping.py — Générateur de la carte du jeu OneMinute.

Parcourt les 4 tomes du manuscrit (dossiers T1 à T4), lit chaque fichier
.md de chapitre, en extrait les métadonnées (tome, chapitre, lieu, heure,
tags) et exporte le tout dans output/map/map-minimal.json, trié par ID
croissant (tome puis numéro de chapitre).

Ce script est en LECTURE SEULE sur le manuscrit : il n'écrit jamais dans
les fichiers .md, uniquement dans le fichier JSON de sortie.

Structure attendue d'un fichier de chapitre (ex: 02-1.md) :

    # 1

    ## Versailles, France, 21:45

    Texte du chapitre...

    #Tanya #USS White Bay #Drone

- Le nombre après "# " est le numéro du chapitre dans le tome (recoupé
  avec le numéro de chapitre dans le nom de fichier).
- La ligne "## ..." contient le lieu et l'heure, séparés par la dernière
  virgule avant l'heure (format HH:MM).
- La dernière ligne non vide du fichier, si elle commence par '#', est
  traitée comme la ligne de tags. Un tag peut contenir des espaces : un
  nouveau tag commence à chaque mot préfixé par '#', et tous les mots
  suivants sans '#' lui sont rattachés (ex: "#USS White Bay" -> tag
  "USS White Bay").

Contrôle de complétude : pour chaque tome, on vérifie qu'on a bien
CHAPTERS_PER_TOME chapitres avec des numéros consécutifs sans trou. Tout
écart (nombre de chapitres différent de 95, saut dans la numérotation,
doublon) est signalé comme erreur globale plutôt que silencieusement
ignoré.

Usage :
    python mapping.py

Les chemins et paramètres de structure (dossier source, dossier de
sortie, bornes de chapitres) sont centralisés dans config.py, à modifier
là-bas si besoin — pas ici.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

import config

# ---------------------------------------------------------------------------
# Patterns de parsing (propres à mapping.py, pas de la config partagée)
# ---------------------------------------------------------------------------

# Pattern des fichiers de chapitre utiles : "02-1.md", "96-95.md", etc.
# Groupe 1 = ordre de classement du fichier, groupe 2 = numéro du chapitre.
FILENAME_PATTERN = re.compile(r"^(\d+)-(\d+)\.md$")

# Ligne "## Lieu, Pays, HH:MM" -> capture (lieu+pays) et (heure)
LOCATION_LINE_RE = re.compile(r"^(.*?),\s*(\d{1,2}:\d{2})\s*$")

# Ligne d'en-tête de chapitre : "# 12" (le numéro de chapitre déclaré dans le texte)
CHAPTER_HEADING_RE = re.compile(r"^#\s+(\d+)\s*$")

# Ligne de sous-titre lieu/heure : "## ...."
SUBHEADING_RE = re.compile(r"^##\s+(.*)$")

# Commentaires HTML (ex: sources en <!-- ... -->), potentiellement sur
# plusieurs lignes, à retirer avant analyse du contenu utile.
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


@dataclass
class Chapitre:
    id: str
    tome: int
    chapitre: int
    lieu: Optional[str]
    heure: Optional[str]
    tags: list[str]
    fichier: str
    avertissements: list[str]
    texte: str  # corps du chapitre seul, sans titre/lieu/tags — retiré avant
                # l'export de map-minimal.json, utilisé uniquement pour corpus.json


def parse_tags_line(line: str) -> list[str]:
    """Extrait les tags d'une ligne, en gérant les tags multi-mots.

    Un nouveau tag commence à chaque mot préfixé par '#'. Tous les mots
    suivants qui ne commencent pas par '#' sont rattachés au tag en
    cours (ex: "#USS White Bay #Drone" -> ["USS White Bay", "Drone"]).
    """
    tokens = line.split()
    tags: list[str] = []
    current: Optional[str] = None

    for tok in tokens:
        if tok.startswith("#"):
            if current is not None:
                tags.append(current.strip())
            current = tok[1:]
        elif current is not None:
            current += " " + tok
        # un mot sans '#' avant le premier tag ne devrait pas arriver
        # (on ne rentre dans cette fonction que si la ligne commence par '#')

    if current is not None:
        tags.append(current.strip())

    return tags


def parse_chapter_file(path: Path, tome_index: int, chapitre_from_filename: int) -> Chapitre:
    """Lit un fichier de chapitre et en extrait les métadonnées.

    Ne lève pas d'exception sur un format inattendu : consigne des
    avertissements dans le champ `avertissements` du chapitre pour que
    les cas à corriger soient visibles dans le JSON final, plutôt que de
    faire échouer tout le run pour un seul fichier mal formé.
    """
    warnings: list[str] = []

    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raw = path.read_text(encoding="latin-1")
        warnings.append("Fichier lu en latin-1 (échec utf-8)")

    # Les commentaires HTML (ex: liens de sources en <!-- ... -->) peuvent
    # traîner après la ligne de tags, sur une ou plusieurs lignes. On les
    # retire avant toute analyse pour que la "dernière ligne non vide"
    # soit bien la ligne de tags, pas un commentaire.
    raw_sans_commentaires = HTML_COMMENT_RE.sub("", raw)

    lines = [ln.rstrip() for ln in raw_sans_commentaires.splitlines()]
    non_empty = [ln for ln in lines if ln.strip() != ""]

    # --- Numéro de chapitre déclaré dans le texte (ligne "# N") ---
    chapitre_declare = None
    for ln in non_empty:
        m = CHAPTER_HEADING_RE.match(ln.strip())
        if m:
            chapitre_declare = int(m.group(1))
            break

    chapitre = chapitre_from_filename
    if chapitre_declare is None:
        warnings.append("Aucune ligne '# N' trouvée pour le numéro de chapitre")
    elif chapitre_declare != chapitre_from_filename:
        warnings.append(
            f"Numéro de chapitre incohérent : fichier={chapitre_from_filename} "
            f"vs texte='# {chapitre_declare}'"
        )

    # --- Lieu / heure (ligne "## ...") ---
    lieu: Optional[str] = None
    heure: Optional[str] = None
    sub_line = None
    for ln in non_empty:
        m = SUBHEADING_RE.match(ln.strip())
        if m:
            sub_line = m.group(1).strip()
            break

    if sub_line is None:
        warnings.append("Aucune ligne '## Lieu, Pays, HH:MM' trouvée")
    else:
        m = LOCATION_LINE_RE.match(sub_line)
        if m:
            lieu = m.group(1).strip()
            heure = m.group(2).strip()
        else:
            lieu = sub_line
            warnings.append(
                f"Impossible d'isoler l'heure dans la ligne de lieu : '{sub_line}'"
            )

    # --- Tags (dernière ligne non vide, si elle commence par '#') ---
    tags: list[str] = []
    tags_line_index: Optional[int] = None
    if non_empty:
        last_line = non_empty[-1].strip()
        if last_line.startswith("#"):
            tags = parse_tags_line(last_line)
            if not tags:
                warnings.append(f"Ligne de tags vide après parsing : '{last_line[:80]}'")
            # retrouve l'indice de cette ligne dans `lines` (en repartant de la fin,
            # au cas où des lignes vides suivraient la ligne de tags)
            for idx in range(len(lines) - 1, -1, -1):
                if lines[idx].strip() == last_line:
                    tags_line_index = idx
                    break
        else:
            warnings.append(
                f"Dernière ligne non reconnue comme ligne de tags : '{last_line[:80]}'"
            )

    # --- Corps du texte (tout ce qui suit le sous-titre lieu/heure, jusqu'à
    # la ligne de tags exclue) ---
    subheading_index: Optional[int] = None
    for idx, ln in enumerate(lines):
        if SUBHEADING_RE.match(ln.strip()):
            subheading_index = idx
            break

    start = (subheading_index + 1) if subheading_index is not None else 0
    end = tags_line_index if tags_line_index is not None else len(lines)
    body_lines = lines[start:end]

    # retire les lignes vides en tête et en fin de corps
    while body_lines and body_lines[0].strip() == "":
        body_lines.pop(0)
    while body_lines and body_lines[-1].strip() == "":
        body_lines.pop()

    texte = "\n".join(body_lines).strip()
    if not texte:
        warnings.append("Corps du texte vide après extraction")

    chapitre_id = f"{tome_index}_{chapitre}"

    return Chapitre(
        id=chapitre_id,
        tome=tome_index,
        chapitre=chapitre,
        lieu=lieu,
        heure=heure,
        tags=tags,
        fichier=str(path),
        avertissements=warnings,
        texte=texte,
    )


def check_tome_completeness(
    tome_index: int, folder: Path, chapitre_numbers: list[int]
) -> list[str]:
    """Vérifie qu'un tome contient bien CHAPTERS_PER_TOME chapitres
    consécutifs, sans trou ni doublon. Retourne la liste des erreurs.
    """
    errors: list[str] = []
    expected = set(range(config.MIN_CHAPTER, config.MAX_CHAPTER + 1))
    found = chapitre_numbers

    if len(found) != len(set(found)):
        seen = set()
        dupes = set()
        for n in found:
            if n in seen:
                dupes.add(n)
            seen.add(n)
        errors.append(
            f"[{folder}] Numéro(s) de chapitre en double : {sorted(dupes)}"
        )

    found_set = set(found)
    missing = sorted(expected - found_set)
    extra = sorted(found_set - expected)

    if missing:
        errors.append(
            f"[{folder}] Saut(s) dans la numérotation, chapitre(s) manquant(s) : {missing}"
        )
    if extra:
        errors.append(
            f"[{folder}] Chapitre(s) hors bornes attendues (1-{config.MAX_CHAPTER}) : {extra}"
        )
    if len(found) != config.CHAPTERS_PER_TOME:
        errors.append(
            f"[{folder}] {len(found)} chapitre(s) trouvé(s), "
            f"{config.CHAPTERS_PER_TOME} attendus"
        )

    return errors


def collect_chapters(root: Path) -> tuple[list[Chapitre], list[str]]:
    """Parcourt les 4 dossiers de tomes et retourne (chapitres, erreurs_globales)."""
    chapters: list[Chapitre] = []
    global_errors: list[str] = []

    for tome_index, folder_name in enumerate(config.TOME_FOLDERS, start=1):
        folder = root / folder_name
        if not folder.is_dir():
            global_errors.append(f"Dossier introuvable : {folder}")
            continue

        tome_chapter_numbers: list[int] = []

        for path in sorted(folder.iterdir()):
            if not path.is_file():
                continue
            m = FILENAME_PATTERN.match(path.name)
            if not m:
                continue  # fichier hors convention (notes, brouillons...), ignoré silencieusement

            order_num = int(m.group(1))
            chapitre_num = int(m.group(2))

            if not (config.MIN_ORDER <= order_num <= config.MAX_ORDER):
                continue
            if not (config.MIN_CHAPTER <= chapitre_num <= config.MAX_CHAPTER):
                continue

            tome_chapter_numbers.append(chapitre_num)
            chapters.append(parse_chapter_file(path, tome_index, chapitre_num))

        if not tome_chapter_numbers:
            global_errors.append(
                f"Aucun fichier de chapitre valide trouvé dans {folder} "
                f"(motif attendu: '02-1.md' à '96-95.md')"
            )
        else:
            global_errors.extend(
                check_tome_completeness(tome_index, folder, tome_chapter_numbers)
            )

    return chapters, global_errors


def main() -> int:
    if not config.SOURCE_ROOT.is_dir():
        print(f"Erreur : dossier source introuvable : {config.SOURCE_ROOT}", file=sys.stderr)
        return 1

    chapters, global_errors = collect_chapters(config.SOURCE_ROOT)

    if not chapters:
        print("Erreur : aucun chapitre n'a pu être extrait.", file=sys.stderr)
        for err in global_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    # Tri par ID croissant : tome, puis numéro de chapitre.
    chapters.sort(key=lambda c: (c.tome, c.chapitre))

    # map-minimal.json : métadonnées seules, sans le texte ni le chemin du
    # fichier source (inutile côté navigateur ; la correspondance avec le
    # texte se fait via l'id, dans corpus.json). Reste volontairement léger.
    chapitres_dicts = [asdict(c) for c in chapters]
    for d in chapitres_dicts:
        d.pop("texte", None)
        d.pop("fichier", None)

    payload = {
        "chapitres": chapitres_dicts,
        "total": len(chapters),
        "erreurs_globales": global_errors,
    }

    # corpus.json : texte brut seul, {id, texte}, pour l'analyse de
    # contenu (liens narratifs/précédence) et le futur moteur RSVP.
    corpus_payload = {
        "chapitres": [{"id": c.id, "texte": c.texte} for c in chapters]
    }

    config.MAP_DIR.mkdir(parents=True, exist_ok=True)
    config.MAP_MINIMAL_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    config.CORPUS_PATH.write_text(
        json.dumps(corpus_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # --- Résumé console ---
    nb_avec_avertissement = sum(1 for c in chapters if c.avertissements)
    print(f"OK : {len(chapters)} chapitres extraits -> {config.MAP_MINIMAL_PATH}")
    print(f"OK : corpus texte -> {config.CORPUS_PATH}")
    if nb_avec_avertissement:
        print(
            f"⚠ {nb_avec_avertissement} chapitre(s) avec au moins un avertissement "
            f"(voir le champ 'avertissements' dans le JSON)."
        )
    if global_errors:
        print(f"⚠ {len(global_errors)} erreur(s) globale(s) / bug(s) de structure :")
        for err in global_errors:
            print(f"  - {err}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
