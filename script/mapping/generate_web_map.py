#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

import config
import reading_graph

WEB_DATA_DIR = config.PROJECT_ROOT / "web" / "data"
WEB_MAP_PATH = WEB_DATA_DIR / "map-points.json"
WEB_CHAPTER_DIR = WEB_DATA_DIR / "chapters"

SPACE_POSITIONS = {
    "Station spatiale, orbite terrestre": {"orbit": 1.10, "theta": 18, "phi": 74},
    "Point de Lagrange 5, Orbite terrestre": {"orbit": 1.18, "theta": 38, "phi": 62},
    "Base réplicants, Vesta": {"orbit": 1.34, "theta": 68, "phi": 108},
    "Station Deep Prospecting, Orbite de Vesta": {"orbit": 1.28, "theta": 76, "phi": 92},
    "Kasei Vallis, Mars": {"orbit": 1.42, "theta": 105, "phi": 116},
    "Éros, Ceinture d’astéroïdes": {"orbit": 1.50, "theta": 122, "phi": 82},
    "Nuage d’Oort, Système solaire": {"orbit": 1.58, "theta": 148, "phi": 48},
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def point_for_chapter(chapter: dict[str, Any]) -> dict[str, Any] | None:
    coords = chapter.get("coordonnees") or {}
    base = {
        "id": chapter["id"],
        "tome": chapter["tome"],
        "chapitre": chapter["chapitre"],
        "lieu": chapter.get("lieu"),
        "heure": chapter.get("heure"),
        "zone": chapter.get("zone"),
        "entry": bool(chapter.get("open_initially")),
        "tags": chapter.get("tags") or [],
        "next_chapter_ids": chapter.get("next_chapter_ids") or [],
        "next_chapter_links": chapter.get("next_chapter_links") or [],
    }

    if coords.get("type") == "earth" and coords.get("lat") is not None and coords.get("lon") is not None:
        return {**base, "type": "earth", "lat": coords["lat"], "lon": coords["lon"]}

    space = SPACE_POSITIONS.get(chapter.get("lieu"))
    if space:
        return {**base, "type": "space", **space}

    return None


def point_key(point: dict[str, Any]) -> tuple[Any, ...]:
    if point["type"] == "earth":
        return ("earth", round(float(point["lat"]), 6), round(float(point["lon"]), 6), point["lieu"])
    return ("space", point.get("theta"), point.get("phi"), point["lieu"])


def merge_location_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}

    for point in points:
        key = point_key(point)
        if key not in grouped:
            grouped[key] = {
                **{k: v for k, v in point.items() if k not in {"id", "tome", "chapitre", "entry", "tags", "next_chapter_ids"}},
                "id": f"lieu_{len(grouped) + 1}",
                "entry": False,
                "chapters": [],
            }

        location = grouped[key]
        location["entry"] = bool(location["entry"] or point["entry"])
        location["chapters"].append({
            "id": point["id"],
            "tome": point["tome"],
            "chapitre": point["chapitre"],
            "lieu": point.get("lieu"),
            "entry": point["entry"],
            "heure": point.get("heure"),
            "tags": point.get("tags") or [],
            "next_chapter_ids": point.get("next_chapter_ids") or [],
            "next_chapter_links": point.get("next_chapter_links") or [],
        })

    for location in grouped.values():
        location["chapters"].sort(key=lambda chapter: (chapter["tome"], chapter["chapitre"]))
        location["chapter_total"] = len(location["chapters"])
        location["chapter_ids"] = [chapter["id"] for chapter in location["chapters"]]
        first_entry = next((chapter for chapter in location["chapters"] if chapter["entry"]), location["chapters"][0])
        location["heure"] = first_entry.get("heure")

    return list(grouped.values())


def export_chapters(map_payload: dict[str, Any], corpus_payload: dict[str, Any]) -> dict[str, str]:
    text_by_id = {chapter["id"]: chapter["texte"] for chapter in corpus_payload.get("chapitres", [])}
    paths: dict[str, str] = {}

    WEB_CHAPTER_DIR.mkdir(parents=True, exist_ok=True)
    for chapter in map_payload.get("chapitres", []):
        chapter_id = str(chapter["id"])
        output = {
            "id": chapter_id,
            "title": f"Chapitre {chapter['chapitre']}",
            "lieu": chapter.get("lieu"),
            "heure": chapter.get("heure"),
            "texte": text_by_id.get(chapter_id, ""),
        }
        path = WEB_CHAPTER_DIR / f"{chapter_id}.json"
        write_json(path, output)
        paths[chapter_id] = f"data/chapters/{chapter_id}.json"

    return paths


def main() -> int:
    map_payload = read_json(config.MAP_FULL_PATH)
    corpus_payload = read_json(config.CORPUS_PATH)
    tag_graph = map_payload.get("tag_graph") or {}

    for chapter in map_payload.get("chapitres", []):
        chapter["next_chapter_links"] = reading_graph.chapter_next_links(chapter, tag_graph)
        chapter["next_chapter_ids"] = reading_graph.chapter_next_ids(chapter, tag_graph)

    chapter_paths = export_chapters(map_payload, corpus_payload)
    chapter_points = [point_for_chapter(chapter) for chapter in map_payload.get("chapitres", [])]
    chapter_points = [point for point in chapter_points if point is not None]
    points = merge_location_points(chapter_points)

    output = {
        "version": 2,
        "source": str(config.MAP_FULL_PATH),
        "initial_open_chapter_ids": map_payload.get("initial_open_chapter_ids", ["1_1"]),
        "chapter_paths": chapter_paths,
        "chapter_total": len(map_payload.get("chapitres", [])),
        "point_chapter_total": len(chapter_points),
        "total": len(points),
        "points": points,
    }

    write_json(WEB_MAP_PATH, output)
    print(
        f"OK : {len(points)} lieux, {len(chapter_points)} chapitres géolocalisés, "
        f"{len(chapter_paths)} textes -> {WEB_MAP_PATH}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
