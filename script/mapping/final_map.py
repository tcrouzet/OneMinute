#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
final_map.py — construit output/map/map.json.

Consolide :
  - map-minimal.json
  - map-bonus-t1.json à map-bonus-t4.json
  - geocoding.json

Règles de lecture encodées :
  - seul le chapitre 1_1 est ouvert au départ ;
  - lire un chapitre débloque le chapitre suivant du même tome ;
  - lire un chapitre débloque ses tags ;
  - pour chaque tag, les chapitres associés doivent être lus dans l'ordre
    des livres : tome puis chapitre.
  - lire un chapitre débloque le chapitre suivant du même lieu, s'il existe.

Les tags sont normalisés en minuscules. Les tags présents dans un seul
chapitre sont retirés du graphe de lecture.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

import config

INITIAL_OPEN_CHAPTER_IDS = {"1_1"}
BONUS_PATHS = [
    config.MAP_DIR / "map-bonus-t1.json",
    config.MAP_DIR / "map-bonus-t2.json",
    config.MAP_DIR / "map-bonus-t3.json",
    config.MAP_DIR / "map-bonus-t4.json",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", str(value)).strip().lower()
    value = value.replace("’", "'")
    return " ".join(value.split())


def normalize_tag(value: str) -> str:
    tag = normalize_text(value)
    key = tag_key(tag)
    aliases = {
        "3dtechnologie": "3d technology",
        "3dtechnology": "3d technology",
    }
    return aliases.get(key, tag)


def tag_key(value: str) -> str:
    value = normalize_text(value)
    value = "".join(
        char for char in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(char)
    )
    value = value.replace("technologie", "technology")
    return re.sub(r"[^a-z0-9]+", "", value)


def chapter_sort_key(chapter_id: str) -> tuple[int, int]:
    tome, chapitre = chapter_id.split("_", 1)
    return int(tome), int(chapitre)


def bonus_by_id() -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for path in BONUS_PATHS:
        payload = read_json(path)
        for chapter in payload.get("chapitres", []):
            chapter_id = str(chapter["id"])
            by_id[chapter_id] = chapter
    return by_id


def collect_raw_tags(minimal: dict[str, Any], bonus: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    tags_by_chapter: dict[str, list[str]] = {}
    for chapter in minimal.get("chapitres", []):
        chapter_id = str(chapter["id"])
        raw_tags: list[str] = []
        raw_tags.extend(chapter.get("tags") or [])

        bonus_chapter = bonus.get(chapter_id) or {}
        raw_tags.extend(bonus_chapter.get("tags_auteur") or [])
        raw_tags.extend(bonus_chapter.get("tags_enrichis") or [])

        normalized = sorted({tag for tag in (normalize_tag(tag) for tag in raw_tags) if tag})
        tags_by_chapter[chapter_id] = normalized
    return tags_by_chapter


def filter_non_unique_tags(tags_by_chapter: dict[str, list[str]]) -> tuple[dict[str, list[str]], Counter[str]]:
    tag_counts: Counter[str] = Counter()
    for tags in tags_by_chapter.values():
        tag_counts.update(set(tags))

    filtered = {
        chapter_id: [tag for tag in tags if tag_counts[tag] > 1]
        for chapter_id, tags in tags_by_chapter.items()
    }
    return filtered, tag_counts


def build_tag_graph(tags_by_chapter: dict[str, list[str]]) -> dict[str, list[str]]:
    tag_graph: dict[str, list[str]] = defaultdict(list)
    for chapter_id, tags in tags_by_chapter.items():
        for tag in tags:
            tag_graph[tag].append(chapter_id)

    return {
        tag: sorted(chapter_ids, key=chapter_sort_key)
        for tag, chapter_ids in sorted(tag_graph.items())
    }


def previous_by_tag(tag_graph: dict[str, list[str]]) -> dict[str, dict[str, str | None]]:
    previous: dict[str, dict[str, str | None]] = defaultdict(dict)
    for tag, chapter_ids in tag_graph.items():
        for index, chapter_id in enumerate(chapter_ids):
            previous[chapter_id][tag] = chapter_ids[index - 1] if index else None
    return previous


def build_location_graph(minimal: dict[str, Any]) -> dict[str, list[str]]:
    by_location: dict[str, list[str]] = defaultdict(list)
    location_labels: dict[str, str] = {}

    for chapter in minimal.get("chapitres", []):
        lieu = chapter.get("lieu")
        if not lieu:
            continue
        key = normalize_text(lieu)
        by_location[key].append(str(chapter["id"]))
        location_labels[key] = str(lieu)

    return {
        location_labels[key]: sorted(chapter_ids, key=chapter_sort_key)
        for key, chapter_ids in sorted(by_location.items())
        if len(chapter_ids) > 1
    }


def location_links(location_graph: dict[str, list[str]]) -> tuple[dict[str, str | None], dict[str, str | None]]:
    previous: dict[str, str | None] = {}
    next_by_chapter: dict[str, str | None] = {}

    for chapter_ids in location_graph.values():
        for index, chapter_id in enumerate(chapter_ids):
            previous[chapter_id] = chapter_ids[index - 1] if index else None
            next_by_chapter[chapter_id] = chapter_ids[index + 1] if index + 1 < len(chapter_ids) else None

    return previous, next_by_chapter


def book_next_links(minimal: dict[str, Any]) -> dict[str, str | None]:
    by_tome: dict[int, list[dict[str, Any]]] = defaultdict(list)
    next_by_chapter: dict[str, str | None] = {}

    for chapter in minimal.get("chapitres", []):
      by_tome[int(chapter["tome"])].append(chapter)

    for chapters in by_tome.values():
        sorted_chapters = sorted(chapters, key=lambda item: int(item["chapitre"]))
        for index, chapter in enumerate(sorted_chapters):
            chapter_id = str(chapter["id"])
            next_by_chapter[chapter_id] = (
                str(sorted_chapters[index + 1]["id"])
                if index + 1 < len(sorted_chapters)
                else None
            )

    return next_by_chapter


def geocode_for_lieu(geocoding: dict[str, Any], lieu: str | None) -> dict[str, Any] | None:
    if not lieu:
        return None
    result = geocoding.get(normalize_text(lieu))
    if not result:
        return None

    coords = {
        "type": result.get("type"),
        "source": result.get("source"),
        "query": result.get("query"),
    }
    if result.get("lat") is not None:
        coords["lat"] = result.get("lat")
    if result.get("lon") is not None:
        coords["lon"] = result.get("lon")
    if result.get("reason"):
        coords["reason"] = result.get("reason")
    return {key: value for key, value in coords.items() if value is not None}


def normalize_geocoding_keys(geocoding: dict[str, Any]) -> dict[str, Any]:
    return {normalize_text(key): value for key, value in geocoding.items()}


def consolidated_chapters(
    minimal: dict[str, Any],
    bonus: dict[str, dict[str, Any]],
    geocoding: dict[str, Any],
    tags_by_chapter: dict[str, list[str]],
    previous_tags: dict[str, dict[str, str | None]],
    previous_location: dict[str, str | None],
    next_location: dict[str, str | None],
    next_book: dict[str, str | None],
) -> list[dict[str, Any]]:
    chapters: list[dict[str, Any]] = []

    for chapter in sorted(minimal.get("chapitres", []), key=lambda item: (item["tome"], item["chapitre"])):
        chapter_id = str(chapter["id"])
        bonus_chapter = bonus.get(chapter_id) or {}
        tags = tags_by_chapter.get(chapter_id, [])
        coords = geocode_for_lieu(geocoding, chapter.get("lieu"))
        open_initially = chapter_id in INITIAL_OPEN_CHAPTER_IDS

        consolidated = {
            **chapter,
            "lieu_detail": bonus_chapter.get("lieu_detail"),
            "zone": bonus_chapter.get("zone"),
            "personnages": bonus_chapter.get("personnages") or [],
            "tags": tags,
            "tags_debloques": tags,
            "tag_predecesseurs": previous_tags.get(chapter_id, {}),
            "livre_suivant": next_book.get(chapter_id),
            "lieu_predecesseur": previous_location.get(chapter_id),
            "lieu_suivant": next_location.get(chapter_id),
            "point_entree": open_initially,
            "open_initially": open_initially,
        }
        if coords:
            consolidated["coordonnees"] = coords

        chapters.append({key: value for key, value in consolidated.items() if value is not None})

    return chapters


def main() -> int:
    minimal = read_json(config.MAP_MINIMAL_PATH)
    bonus = bonus_by_id()
    geocoding = normalize_geocoding_keys(read_json(config.GEOCODING_CACHE_PATH))

    raw_tags_by_chapter = collect_raw_tags(minimal, bonus)
    tags_by_chapter, tag_counts = filter_non_unique_tags(raw_tags_by_chapter)
    tag_graph = build_tag_graph(tags_by_chapter)
    previous_tags = previous_by_tag(tag_graph)
    location_graph = build_location_graph(minimal)
    previous_location, next_location = location_links(location_graph)
    next_book = book_next_links(minimal)
    chapters = consolidated_chapters(
        minimal,
        bonus,
        geocoding,
        tags_by_chapter,
        previous_tags,
        previous_location,
        next_location,
        next_book,
    )

    payload = {
        "version": 1,
        "sources": {
            "minimal": str(config.MAP_MINIMAL_PATH),
            "bonus": [str(path) for path in BONUS_PATHS],
            "geocoding": str(config.GEOCODING_CACHE_PATH),
        },
        "initial_open_chapter_ids": sorted(INITIAL_OPEN_CHAPTER_IDS, key=chapter_sort_key),
        "rules": {
            "initial_open": "Seul le chapitre 1_1 est ouvert au départ.",
            "book_unlock": "Lire un chapitre débloque le chapitre suivant du même tome, s'il existe.",
            "tag_unlock": "Lire un chapitre débloque ses tags.",
            "tag_order": "Les chapitres associés à un tag se lisent dans l'ordre tome puis chapitre.",
            "location_unlock": "Lire un chapitre débloque le chapitre suivant du même lieu, s'il existe.",
            "unique_tags": "Les tags présents dans un seul chapitre sont retirés du graphe.",
        },
        "tag_graph": tag_graph,
        "location_graph": location_graph,
        "tag_total": len(tag_graph),
        "location_total": len(location_graph),
        "tag_unique_removed_total": sum(1 for count in tag_counts.values() if count == 1),
        "chapitres": chapters,
        "total": len(chapters),
        "erreurs_globales": minimal.get("erreurs_globales", []),
    }

    write_json(config.MAP_FULL_PATH, payload)
    print(
        f"OK : {len(chapters)} chapitres, {len(tag_graph)} tags de lecture -> {config.MAP_FULL_PATH}"
    )
    print(f"OK : point d'entrée initial -> {', '.join(payload['initial_open_chapter_ids'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
