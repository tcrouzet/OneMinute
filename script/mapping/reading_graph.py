#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

from typing import Any


def chapter_sort_key(chapter_id: str) -> tuple[int, int]:
    tome, chapitre = chapter_id.split("_", 1)
    return int(tome), int(chapitre)


def chapter_next_links(chapter: dict[str, Any], tag_graph: dict[str, list[str]]) -> list[dict[str, Any]]:
    """Return one map link per destination, with all unlock causes attached."""
    chapter_id = str(chapter["id"])
    links: list[dict[str, str]] = []

    links.extend(tag_links(chapter_id, chapter.get("tags") or [], tag_graph))
    if chapter.get("livre_suivant"):
        links.append({
            "to": str(chapter["livre_suivant"]),
            "type": "livre",
            "label": "chapitre suivant",
        })
    if chapter.get("lieu_suivant"):
        links.append({
            "to": str(chapter["lieu_suivant"]),
            "type": "lieu",
            "label": "même lieu",
        })

    return merge_links_by_destination(links)


def chapter_next_ids(chapter: dict[str, Any], tag_graph: dict[str, list[str]]) -> list[str]:
    return sorted(
        {link["to"] for link in chapter_next_links(chapter, tag_graph)},
        key=chapter_sort_key,
    )


def tag_links(chapter_id: str, tags: list[str], tag_graph: dict[str, list[str]]) -> list[dict[str, str]]:
    links: list[dict[str, str]] = []
    for tag in tags:
        ids = tag_graph.get(tag) or []
        if chapter_id not in ids:
            continue
        index = ids.index(chapter_id)
        if index + 1 < len(ids):
            links.append({
                "to": ids[index + 1],
                "type": "tag",
                "label": tag,
            })
    return links


def merge_links_by_destination(links: list[dict[str, str]]) -> list[dict[str, Any]]:
    by_destination: dict[str, dict[str, Any]] = {}
    for link in links:
        destination = link["to"]
        if destination not in by_destination:
            by_destination[destination] = {
                "to": destination,
                "type": link["type"],
                "label": link["label"],
                "labels": [],
                "types": [],
            }
        merged = by_destination[destination]
        if link["label"] not in merged["labels"]:
            merged["labels"].append(link["label"])
        if link["type"] not in merged["types"]:
            merged["types"].append(link["type"])
        merged["label"] = " + ".join(merged["labels"])
        merged["type"] = "+".join(merged["types"])
    return list(by_destination.values())
