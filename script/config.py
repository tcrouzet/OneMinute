#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
config.py — Paramètres partagés du projet OneMinute (carte du jeu).

Toute la configuration qui doit rester stable entre plusieurs scripts
(mapping.py aujourd'hui, puis les scripts de liens spatiaux/thématiques/
narratifs/précédence à venir) vit ici. Un seul endroit à modifier si le
dossier du manuscrit change, si le découpage évolue, ou si de nouveaux
tomes sont ajoutés.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Chemins
# ---------------------------------------------------------------------------

# Dossier Manuscrit contenant les sous-dossiers T1..T4. En dur : c'est la
# source unique de vérité, à modifier ici si l'emplacement change.
SOURCE_ROOT = Path(
    "/Users/thierrycrouzet/Documents/ObsidianLocal/text/Archives/1minute/Manuscrit"
)

# Racine du projet = parent du dossier script/.
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Toutes les données générées vivent sous output/. La carte du jeu vit
# sous output/map/ (les futurs scripts pourront ajouter output/voix/,
# output/audio/, etc. au même endroit).
OUTPUT_DIR = PROJECT_ROOT / "output"
MAP_DIR = OUTPUT_DIR / "map"

# Fichiers générés (un par étape du pipeline ; les scripts suivants
# ajouteront leurs propres constantes ici au même endroit).
MAP_MINIMAL_PATH = MAP_DIR / "map-minimal.json"
MAP_FULL_PATH = MAP_DIR / "map.json"
GEOCODING_CACHE_PATH = MAP_DIR / "geocoding.json"
NAVIGATION_GRAPH_PATH = MAP_DIR / "onemminute_navigation_graph.json"

# Corpus séparé : {id, texte} pour chaque chapitre (texte brut, sans
# titre/lieu/tags). Reste hors de map-minimal.json pour ne pas alourdir
# ce qui sera potentiellement chargé côté navigateur. Utile pour les
# étapes de liens narratifs/précédence (analyse de contenu) et plus tard
# comme source du moteur RSVP.
CORPUS_PATH = MAP_DIR / "corpus.json"

# ---------------------------------------------------------------------------
# Structure du manuscrit
# ---------------------------------------------------------------------------

# Noms des sous-dossiers de tomes, dans l'ordre. tome_index part de 1.
TOME_FOLDERS = ["T1", "T2", "T3", "T4"]

# Bornes de sécurité : 95 chapitres par tome, fichiers "02-1.md" à "96-95.md".
# Groupe 1 du nom de fichier = ordre de classement, groupe 2 = numéro de chapitre.
MIN_ORDER = 2
MAX_ORDER = 96
MIN_CHAPTER = 1
MAX_CHAPTER = 95
CHAPTERS_PER_TOME = 95
