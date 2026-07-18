#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
geocode_map.py — Ajoute les coordonnées géographiques dans output/map/map.json.

Le script lit les lieux déjà présents dans output/map/map.json, géocode chaque
lieu terrestre unique avec Nominatim/OpenStreetMap, met les résultats en cache
dans output/map/geocoding-cache.json, puis réécrit map.json en ajoutant un champ
`coordonnees` à chaque chapitre.

Usage courant :
    python3 geocode_map.py

Options utiles :
    python3 geocode_map.py --dry-run
    python3 geocode_map.py --limit 20
    python3 geocode_map.py --force

Nominatim demande un User-Agent explicite et un rythme raisonnable. Le script
attend donc 1 seconde entre deux requêtes réseau non cachées.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_ROOT = Path(__file__).resolve().parents[1]
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

import config

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "OneMinute geocoder local script"
REQUEST_DELAY_SECONDS = 1.05

SPACE_KEYWORDS = (
    "orbite",
    "station spatiale",
    "vesta",
    "mars",
    "lune",
    "espace",
)

MANUAL_GEOCODES = {
    "Akademgorodok, Russie": (54.8519, 83.1060),
    "Alexandrie, Égypte": (31.2001, 29.9187),
    "Alger, Algérie": (36.7538, 3.0588),
    "Alto Lucero, Mexique": (19.6167, -96.7333),
    "Amsterdam, Pays-Bas": (52.3676, 4.9041),
    "Anchorage, États-Unis": (61.2181, -149.9003),
    "Annaba, Algérie": (36.9000, 7.7667),
    "Aogashima, Japon": (32.4580, 139.7670),
    "Archipel des Gambier, Polynésie française": (-23.1333, -134.9667),
    "Arecibo, Porto Rico": (18.4724, -66.7157),
    "Arlington County, États-Unis": (38.8816, -77.0910),
    "Artarmon, Australie": (-33.8089, 151.1831),
    "Ashburn, États-Unis": (39.0438, -77.4874),
    "Astana, Kazakhstan": (51.1694, 71.4491),
    "Atacama, Chili": (-23.8634, -69.1328),
    "Atlanta, États-Unis": (33.7490, -84.3880),
    "Atuona, Îles Marquises": (-9.8033, -139.0420),
    "Auckland, Nouvelle-Zélande": (-36.8485, 174.7633),
    "Bangalore, Inde": (12.9716, 77.5946),
    "Bangkok, Thaïlande": (13.7563, 100.5018),
    "Barcelone, Espagne": (41.3874, 2.1686),
    "Base Dumont d'Urville, Antarctique": (-66.6630, 140.0010),
    "Berlin, Allemagne": (52.5200, 13.4050),
    "Bodrum, Turquie": (37.0344, 27.4305),
    "Bordeaux, France": (44.8378, -0.5792),
    "Bruxelles, Belgique": (50.8503, 4.3517),
    "Budapest, Hongrie": (47.4979, 19.0402),
    "Buenos Aires, Argentine": (-34.6037, -58.3816),
    "Bugarach, France": (42.8758, 2.3506),
    "Bureh Beach, Sierra Leone": (8.2180, -13.1550),
    "Byurakan, Arménie": (40.3306, 44.2733),
    "CERN, Suisse": (46.2339, 6.0553),
    "Cambridge, États-Unis": (42.3736, -71.1097),
    "Cape Town, Afrique du Sud": (-33.9249, 18.4241),
    "Caracas, Vénézuéla": (10.4806, -66.9036),
    "Castel Gandolfo, Italie": (41.7469, 12.6503),
    "Chatham Island, Nouvelle-Zélande": (-43.9500, -176.5500),
    "Chobar, Népal": (27.6583, 85.2917),
    "Chongjin, Corée du Nord": (41.7956, 129.7758),
    "Chongqing, Chine": (29.5630, 106.5516),
    "Christmas Island, Kiribati": (1.8721, -157.4278),
    "Colobraro, Italie": (40.1880, 16.4240),
    "Copenhague, Danemark": (55.6761, 12.5683),
    "Cristal Bay, États-Unis": (39.2260, -120.0060),
    "Dar es Salaam, Tanzanie": (-6.7924, 39.2083),
    "Diego Garcia, Royaume-Uni": (-7.3133, 72.4111),
    "Discovery Island, Bahamas": (25.0300, -77.4000),
    "Djibouti, Djibouti": (11.5721, 43.1456),
    "Errázuriz, Chili": (-32.9167, -70.5667),
    "Essaouira, Maroc": (31.5085, -9.7595),
    "Florac, France": (44.3253, 3.5933),
    "Fort George G. Maeade, États-Unis": (39.1084, -76.7432),
    "Fort George G. Meade, États-Unis": (39.1084, -76.7432),
    "Freetown, Sierra Leone": (8.4657, -13.2317),
    "Goa, Inde": (15.2993, 74.1240),
    "Goheung, Corée du Sud": (34.6112, 127.2847),
    "Grozny, Tchétchénie": (43.3178, 45.6987),
    "Hat Creek, États-Unis": (40.8160, -121.4720),
    "Haïfa, Israël": (32.7940, 34.9896),
    "Heidelberg, Allemagne": (49.3988, 8.6724),
    "Helsinki, Finlande": (60.1699, 24.9384),
    "Hohhot, Chine": (40.8426, 111.7492),
    "Honolulu, États-Unis": (21.3069, -157.8583),
    "Houston, États-Unis": (29.7604, -95.3698),
    "Irbe lighthouse, Lettonie": (57.7560, 21.7220),
    "Islamorada, États-Unis": (24.9243, -80.6278),
    "Istanbul, Turquie": (41.0082, 28.9784),
    "Jackson Hole, États-Unis": (43.4799, -110.7624),
    "Johannesburg, Afrique du Sud": (-26.2041, 28.0473),
    "Jérusalem, Israël": (31.7683, 35.2137),
    "Kaboul, Afghanistan": (34.5553, 69.2075),
    "Karnak, Égypte": (25.7188, 32.6573),
    "Kashgar, Chine": (39.4704, 75.9898),
    "Key Largo, États-Unis": (25.0865, -80.4473),
    "Kingston, Australie": (-42.9767, 147.3094),
    "Kingston, Jamaïque": (17.9712, -76.7936),
    "Kirkkonummi, Finlande": (60.1238, 24.4385),
    "Kolka, Lettonie": (57.7487, 22.5838),
    "Kowloon, Hong Kong": (22.3193, 114.1694),
    "Koyasan, Japon": (34.2125, 135.5863),
    "Kuda Hithi, Maldive": (4.3290, 73.5910),
    "Kyoto, Japon": (35.0116, 135.7681),
    "La Croix-de-Rozon, Suisse": (46.1500, 6.1167),
    "La lagune, France": (43.2800, 3.5100),
    "Lake Tahoe, États-Unis": (39.0968, -120.0324),
    "Lancaster, États-Unis": (40.0379, -76.3055),
    "Lhassa, Tibet": (29.6500, 91.1000),
    "Lisbonne, Portugal": (38.7223, -9.1393),
    "Lokolama, Congo": (-4.0500, 15.3000),
    "Londres, Angleterre": (51.5072, -0.1276),
    "Lord Howe Island, Australie": (-31.5553, 159.0821),
    "Los Angeles, États-Unis": (34.0522, -118.2437),
    "Lyon, France": (45.7640, 4.8357),
    "Madrid, Espagne": (40.4168, -3.7038),
    "Majuro, Marshall Islands": (7.1164, 171.1858),
    "Malaga, Espagne": (36.7213, -4.4214),
    "Malmö, Suède": (55.6050, 13.0038),
    "Mascate, Sultanat d’Oman": (23.5880, 58.3829),
    "Mashhad, Iran": (36.2605, 59.6168),
    "Melbourne, Australie": (-37.8136, 144.9631),
    "Mendoza, Argentine": (-32.8895, -68.8458),
    "Milan, Italie": (45.4642, 9.1900),
    "Monaco, Monaco": (43.7384, 7.4246),
    "Monkey Bay, Malawi": (-14.0824, 34.9169),
    "Montauk, États-Unis": (41.0359, -71.9545),
    "Montevideo, Uruguay": (-34.9011, -56.1645),
    "Montpellier, France": (43.6119, 3.8772),
    "Montréal, Canada": (45.5019, -73.5674),
    "Moscou, Russie": (55.7558, 37.6173),
    "Mountain View, États-Unis": (37.3861, -122.0839),
    "Mousehole, Angleterre": (50.0830, -5.5390),
    "Mumbai, Inde": (19.0760, 72.8777),
    "Munich, Allemagne": (48.1351, 11.5820),
    "Muthorai, Inde": (11.4000, 76.7000),
    "Mutitjulu, Australie": (-25.3468, 131.0369),
    "Nagoya, Japon": (35.1815, 136.9066),
    "Nairobi, Kenya": (-1.2921, 36.8219),
    "Naples, Italie": (40.8518, 14.2681),
    "Necker Island, îles Vierges": (18.5280, -64.3580),
    "New York, États-Unis": (40.7128, -74.0060),
    "Newport, États-Unis": (41.4901, -71.3128),
    "Nouadhibou, Mauritanie": (20.9425, -17.0362),
    "Nuku’alofa, Tonga": (-21.1393, -175.2049),
    "Nuuk, Groenland": (64.1835, -51.7216),
    "Oklahoma City, États-Unis": (35.4676, -97.5164),
    "Oslo, Norvège": (59.9139, 10.7522),
    "Ottawa, Canada": (45.4215, -75.6972),
    "Oxford, Angleterre": (51.7520, -1.2577),
    "Pago Pago, Samoa américaines": (-14.2756, -170.7020),
    "Panama City, Panama": (8.9824, -79.5199),
    "Paris, France": (48.8566, 2.3522),
    "Parkes, Australie": (-33.1372, 148.1759),
    "Pearl Harbor, États-Unis": (21.3675, -157.9711),
    "Pebbly Beach, Australie": (-35.5950, 150.3320),
    "Petropavlovsk-Kamchatsky, Russie": (53.0370, 158.6559),
    "Plateforme Elgin, Mer du Nord": (57.0000, 2.1000),
    "Ponta Delgada, Portugal": (37.7394, -25.6687),
    "Port Moresby, Nouvelle-Guinée": (-9.4438, 147.1803),
    "Portillo, Chili": (-32.8360, -70.1290),
    "Porto, Portugal": (41.1579, -8.6291),
    "Portsmouth, États-Unis": (43.0718, -70.7626),
    "Poznań, Pologne": (52.4064, 16.9252),
    "Praia, Cap Vert": (14.9330, -23.5133),
    "Puerto Isidro Ayora, Équateur": (-0.7433, -90.3138),
    "Puerto Montt, Chili": (-41.4689, -72.9411),
    "Rangoon, Myanmar": (16.8409, 96.1735),
    "Rawalpindi, Pakistan": (33.5651, 73.0169),
    "Redmond, États-Unis": (47.6740, -122.1215),
    "Resolute, Canada": (74.6973, -94.8297),
    "Reykjavik, Islande": (64.1466, -21.9426),
    "Rome, Italie": (41.9028, 12.4964),
    "Ruhnu, Estonie": (57.8000, 23.2500),
    "Réserve de Sarakawa, Togo": (9.6000, 1.1000),
    "Réserve du Néouvielle, France": (42.8310, 0.1660),
    "Réserve du Paracas, Pérou": (-13.8350, -76.2500),
    "Saint-Pétersbourg, Russie": (59.9311, 30.3609),
    "Salto Ángel, Vénézuéla": (5.9675, -62.5356),
    "Samara, Russie": (53.1959, 50.1002),
    "San Andrés Zabache, Mexique": (16.6380, -96.8600),
    "San Diego, États-Unis": (32.7157, -117.1611),
    "San Francisco, États-Unis": (37.7749, -122.4194),
    "Santa Cruz, États-Unis": (36.9741, -122.0308),
    "Santa Fe, États-Unis": (35.6870, -105.9378),
    "Seattle, États-Unis": (47.6062, -122.3321),
    "Sheffield, Angleterre": (53.3811, -1.4701),
    "Shenzhen, Chine": (22.5431, 114.0579),
    "Singapour, République de Singapour": (1.3521, 103.8198),
    "Snow Lake, États-Unis": (37.7350, -119.6000),
    "Sofia, Bulgarie": (42.6977, 23.3219),
    "Station Princesse-Élisabeth, Antarctique": (-71.9499, 23.3470),
    "Stone Town, Zanzibar": (-6.1622, 39.1921),
    "Sydney, Australie": (-33.8688, 151.2093),
    "São Paulo, Brésil": (-23.5558, -46.6396),
    "Sète, France": (43.4079, 3.6966),
    "Séville, Espagne": (37.3891, -5.9845),
    "Taipei, Taiwan": (25.0330, 121.5654),
    "Tallinn, Estonie": (59.4370, 24.7536),
    "Teton Village, États-Unis": (43.5870, -110.8270),
    "The Dalles, États-Unis": (45.5946, -121.1787),
    "Thermosphère, Pacifique Sud": (-45.0000, -140.0000),
    "Thessalonique, Grèce": (40.6401, 22.9444),
    "Tikal, Honduras": (17.2220, -89.6237),
    "Tokyo, Japon": (35.6762, 139.6503),
    "Toronto, Canada": (43.6532, -79.3832),
    "Tunis, Tunisie": (36.8065, 10.1815),
    "Turin, Italie": (45.0703, 7.6869),
    "Tórshavn, Îles Féroé": (62.0079, -6.7900),
    "Türkmenbaşy, Turkménistan": (40.0222, 52.9552),
    "Valencia, Vénézuéla": (10.1579, -67.9972),
    "Vancouver, Canada": (49.2827, -123.1207),
    "Varsovie, Pologne": (52.2297, 21.0122),
    "Vatican, Italie": (41.9029, 12.4534),
    "Venise, Italie": (45.4408, 12.3155),
    "Versailles, France": (48.8049, 2.1204),
    "Vienne, Autriche": (48.2082, 16.3738),
    "Vladivostok, Russie": (43.1155, 131.8855),
    "Washington, États-Unis": (38.9072, -77.0369),
    "Wellington, Nouvelle-Zélande": (-41.2865, 174.7762),
    "Winnipeg, Canada": (49.8951, -97.1384),
    "Xunantunich, Bélize": (17.0891, -89.1415),
    "Yevpatoria, Crimée": (45.1905, 33.3668),
    "Zelenchukskaya, Russie": (43.8583, 41.5894),
    "Älvdalen, Suède": (61.2277, 14.0394),
}

QUERY_REPLACEMENTS = {
    "États-Unis": "United States",
    "Etats-Unis": "United States",
    "Angleterre": "United Kingdom",
    "République de Singapour": "Singapore",
    "Sultanat d’Oman": "Oman",
    "Sultanat d'Oman": "Oman",
    "Vénézuéla": "Venezuela",
    "Îles Féroé": "Faroe Islands",
    "Marshall Islands": "Marshall Islands",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def normalize_key(value: str) -> str:
    value = value.strip().lower()
    value = unicodedata.normalize("NFKC", value)
    return " ".join(value.split())


def is_space_place(lieu: str, zone: str | None) -> bool:
    haystack = normalize_key(f"{lieu} {zone or ''}")
    return any(keyword in haystack for keyword in SPACE_KEYWORDS)


def build_query(lieu: str) -> str:
    query = lieu
    for source, target in QUERY_REPLACEMENTS.items():
        query = query.replace(source, target)
    return query


def geocode_nominatim(query: str, timeout: float) -> dict[str, Any] | None:
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "addressdetails": 1,
        }
    )
    request = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        results = json.loads(response.read().decode("utf-8"))

    if not results:
        return None

    best = results[0]
    return {
        "type": "earth",
        "lat": float(best["lat"]),
        "lon": float(best["lon"]),
        "source": "nominatim",
        "query": query,
        "display_name": best.get("display_name"),
        "osm_type": best.get("osm_type"),
        "osm_id": best.get("osm_id"),
    }


def load_cache(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return load_json(path)


def collect_places(map_payload: dict[str, Any]) -> list[dict[str, str | None]]:
    places: dict[str, dict[str, str | None]] = {}
    for chapter in map_payload.get("chapitres", []):
        lieu = chapter.get("lieu")
        if not lieu:
            continue
        key = normalize_key(lieu)
        places.setdefault(
            key,
            {
                "lieu": lieu,
                "zone": chapter.get("zone"),
            },
        )
    return sorted(places.values(), key=lambda item: str(item["lieu"]))


def build_space_result(lieu: str) -> dict[str, Any]:
    return {
        "type": "space",
        "lat": None,
        "lon": None,
        "source": "not_geocoded",
        "reason": f"Lieu non terrestre : {lieu}",
    }


def build_manual_result(lieu: str, lat: float, lon: float) -> dict[str, Any]:
    return {
        "type": "earth",
        "lat": lat,
        "lon": lon,
        "source": "manual_seed",
        "query": lieu,
    }


def enrich_map(map_payload: dict[str, Any], cache: dict[str, Any]) -> dict[str, int]:
    stats = {
        "chapitres_avec_coordonnees": 0,
        "chapitres_sans_coordonnees": 0,
    }

    for chapter in map_payload.get("chapitres", []):
        lieu = chapter.get("lieu")
        if not lieu:
            chapter["coordonnees"] = {
                "type": "unknown",
                "lat": None,
                "lon": None,
                "source": "missing_lieu",
            }
            stats["chapitres_sans_coordonnees"] += 1
            continue

        cached = cache.get(normalize_key(lieu))
        if cached:
            chapter["coordonnees"] = cached
        else:
            chapter["coordonnees"] = {
                "type": "unknown",
                "lat": None,
                "lon": None,
                "source": "not_in_cache",
            }

        if chapter["coordonnees"].get("lat") is None or chapter["coordonnees"].get("lon") is None:
            stats["chapitres_sans_coordonnees"] += 1
        else:
            stats["chapitres_avec_coordonnees"] += 1

    map_payload["geocodage"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cache": str(config.GEOCODING_CACHE_PATH),
        **stats,
    }

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--map",
        type=Path,
        default=config.MAP_FULL_PATH,
        help="Chemin du map.json à enrichir.",
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=config.GEOCODING_CACHE_PATH,
        help="Chemin du cache de géocodage.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Ne réécrit ni le cache ni map.json.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore le cache existant et regéocode les lieux terrestres.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Nombre maximum de lieux non cachés à traiter pendant cette exécution.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="Timeout réseau par requête Nominatim.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_map_path = args.map
    if input_map_path == config.MAP_FULL_PATH and not input_map_path.exists():
        input_map_path = config.MAP_MINIMAL_PATH
    map_payload = load_json(input_map_path)
    cache = {} if args.force else load_cache(args.cache)
    places = collect_places(map_payload)

    requested = 0
    failed: list[str] = []

    for place in places:
        lieu = str(place["lieu"])
        zone = place.get("zone")
        key = normalize_key(lieu)

        if not args.force and key in cache:
            continue

        if lieu in MANUAL_GEOCODES:
            lat, lon = MANUAL_GEOCODES[lieu]
            cache[key] = build_manual_result(lieu, lat, lon)
            continue

        if is_space_place(lieu, str(zone or "")):
            cache[key] = build_space_result(lieu)
            continue

        if args.limit is not None and requested >= args.limit:
            continue

        query = build_query(lieu)
        print(f"Géocodage : {lieu} -> {query}")
        requested += 1

        if args.dry_run:
            continue

        try:
            result = geocode_nominatim(query, args.timeout)
        except Exception as exc:
            failed.append(f"{lieu} ({exc})")
            continue

        if result is None:
            failed.append(lieu)
            cache[key] = {
                "type": "unknown",
                "lat": None,
                "lon": None,
                "source": "nominatim",
                "query": query,
                "reason": "Aucun résultat",
            }
        else:
            cache[key] = result

        time.sleep(REQUEST_DELAY_SECONDS)

    stats = enrich_map(map_payload, cache)

    if not args.dry_run:
        args.cache.parent.mkdir(parents=True, exist_ok=True)
        write_json(args.cache, cache)
        write_json(args.map, map_payload)

    print(f"Lieux uniques : {len(places)}")
    print(f"Cache : {len(cache)} entrée(s)")
    request_label = "Requêtes réseau prévues" if args.dry_run else "Requêtes réseau cette exécution"
    print(f"{request_label} : {requested}")
    print(
        "Chapitres avec coordonnées : "
        f"{stats['chapitres_avec_coordonnees']} / {len(map_payload.get('chapitres', []))}"
    )
    if failed:
        print("Lieux à corriger ou compléter manuellement :")
        for item in failed:
            print(f"  - {item}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
