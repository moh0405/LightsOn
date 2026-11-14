#!/usr/bin/env python3
"""Fetch Vexcel imagery, footprints, and detections for hero buildings.

Saves:
- Images to apps/web/public/media/<id>/ (gitignored)
- Fixture metadata to server/fixtures/vexcel/<id>.json (committed, small, no API keys or raw bytes)
"""
import argparse
import json
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from shapely import wkt as shapely_wkt
from shapely.geometry import mapping, shape
from app.data.vexcel import VexcelClient, square_around, to_wkt

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fetch_vexcel")

DEFAULT_HEROES = [x.strip() for x in os.getenv("HERO_PROPERTY_IDS", "233953,233899").split(",") if x.strip()]
DEFAULT_LABELS = ["parking lot", "car", "rooftop terrace", "solar panel", "tree"]


def get_coordinates(pid: str) -> tuple[float, float]:
    """Look up coordinates from existing fixture dossier or fallback."""
    dossier_path = ROOT / f"server/fixtures/dossiers/{pid}.json"
    if dossier_path.is_file():
        data = json.loads(dossier_path.read_text())
        return data["lat"], data["lng"]
    # Fallback to known hero coordinates from PRD
    if pid == "233953":
        return 29.7588018, -95.3650891
    if pid == "233899":
        return 29.7584604, -95.3682126
    raise ValueError(f"Unknown property ID {pid} and no dossier found at {dossier_path}")


def fetch_building(pid: str, labels: list[str], client: VexcelClient, media_root: Path, fixtures_root: Path) -> dict:
    lat, lng = get_coordinates(pid)
    logger.info("Fetching Vexcel data for property %s at lat=%.6f, lng=%.6f", pid, lat, lng)

    media_dir = media_root / pid
    media_dir.mkdir(parents=True, exist_ok=True)
    fixtures_root.mkdir(parents=True, exist_ok=True)

    # 1. Elements property attributes
    prop = client.property(lat, lng, property_id=pid)
    features = prop.get("features", [])
    parcel_wkt = None
    footprint_geom = None
    ortho_date = None
    collection = None

    if features:
        feat = features[0]
        attrs = feat.get("properties", {})
        collection = attrs.get("metadata.collection")
        ortho_date = attrs.get("metadata.ortho-date-estimate")
        if feat.get("geometry"):
            try:
                parcel_wkt = shape(feat["geometry"]).wkt
            except Exception as e:
                logger.warning("Could not convert parcel geometry to WKT: %s", e)

        # Primary structure footprint
        structures = attrs.get("structures", [])
        for s in structures:
            if s.get("primary-structure") and s.get("footprint.wkt"):
                try:
                    footprint_geom = mapping(shapely_wkt.loads(s["footprint.wkt"]))
                    break
                except Exception as e:
                    logger.warning("Failed parsing primary structure footprint.wkt: %s", e)

    if not parcel_wkt:
        logger.info("No parcel polygon available for %s, using fallback square", pid)
        parcel_wkt = square_around(lat, lng, 40)

    # 2. Ortho imagery
    ortho_bytes = client.ortho(parcel_wkt, property_id=pid)
    ortho_filename = None
    if ortho_bytes:
        ortho_path = media_dir / "ortho.jpg"
        ortho_path.write_bytes(ortho_bytes)
        ortho_filename = "ortho.jpg"
        logger.info("Saved ortho image to %s (%d KB)", ortho_path, len(ortho_bytes) // 1024)

    # 3. Oblique imagery
    obliques_dict = client.obliques(parcel_wkt, property_id=pid)
    saved_obliques = []
    for direction, img_bytes in obliques_dict.items():
        img_name = f"{direction}.jpg"
        img_path = media_dir / img_name
        img_path.write_bytes(img_bytes)
        saved_obliques.append(img_name)
        logger.info("Saved oblique %s to %s (%d KB)", direction, img_path, len(img_bytes) // 1024)
    saved_obliques.sort()

    # 4. Elements detect
    detect_resp = client.detect(parcel_wkt, labels=labels, property_id=pid)
    detections_summary: dict[str, dict] = {label: {"count": 0, "confidences": []} for label in labels}
    for feat in detect_resp.get("features", []):
        lbl = feat.get("properties", {}).get("label")
        dets = feat.get("properties", {}).get("detections", [])
        if lbl in detections_summary:
            detections_summary[lbl]["count"] += len(dets)
            detections_summary[lbl]["confidences"].extend([round(d["confidence"], 3) for d in dets if "confidence" in d])

    # 5. Build compact fixture dictionary
    fixture = {
        "property_id": str(pid),
        "footprint": footprint_geom,
        "capture_dates": {
            "ortho": ortho_date,
            "collection": collection,
        },
        "images": {
            "ortho": ortho_filename,
            "obliques": saved_obliques,
        },
        "detections": [
            {
                "label": label,
                "count": detections_summary[label]["count"],
                "confidences": sorted(detections_summary[label]["confidences"], reverse=True),
            }
            for label in labels
        ],
    }

    fixture_path = fixtures_root / f"{pid}.json"
    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n")
    logger.info("Wrote fixture for %s to %s", pid, fixture_path)
    return fixture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("property_ids", nargs="*", default=DEFAULT_HEROES, help="Property IDs to fetch")
    parser.add_argument("--media-dir", type=Path, default=ROOT / "apps/web/public/media")
    parser.add_argument("--fixtures-dir", type=Path, default=ROOT / "server/fixtures/vexcel")
    args = parser.parse_args()

    client = VexcelClient()
    results = {}
    for pid in args.property_ids:
        fixture = fetch_building(pid, DEFAULT_LABELS, client, args.media_dir, args.fixtures_dir)
        has_fp = fixture.get("footprint") is not None
        ortho_ok = fixture["images"]["ortho"] is not None
        oblique_count = len(fixture["images"]["obliques"])
        det_counts = {d["label"]: d["count"] for d in fixture["detections"]}
        results[pid] = {
            "footprint": has_fp,
            "ortho": ortho_ok,
            "oblique_count": oblique_count,
            "detections": det_counts,
        }

    print("\n=== Vexcel Fetch Summary ===")
    for pid, info in results.items():
        print(f"Property {pid}:")
        print(f"  Footprint: {'YES' if info['footprint'] else 'NO'}")
        print(f"  Images: Ortho={'YES' if info['ortho'] else 'NO'}, Obliques={info['oblique_count']}")
        print(f"  Detections: {info['detections']}")


if __name__ == "__main__":
    main()
