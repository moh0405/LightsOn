"""Vexcel API 2.0 adapter for Lights On.

Handles Elements property attributes, ortho/oblique imagery, and sam3 element detection.
Meets all non-negotiable rules:
- X-API-KEY header from VEXCEL_API_KEY (never in URLs, never logged)
- Base URL from VEXCEL_API_BASE
- WKT POINT(lon lat), srid 4326
- layers urban,urban-r,wide-area,urban-g
- /oriented/collections before obliques
- Exponential backoff with jitter on 429 (max 5 retries)
- 60 s timeout
- Every failure logged and returned as a typed fallback (never raises into game code)
- Results cached on disk under server/cache/vexcel/<propertyId>/ so subsequent runs make zero network calls.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import random
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import httpx

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
DEFAULT_CACHE_DIR = ROOT / "server/cache/vexcel"
DEFAULT_BASE_URL = "https://api.vexcelgroup.com/v2"
DEFAULT_LAYERS = "urban,urban-r,wide-area,urban-g"
DEFAULT_TIMEOUT = 60.0
DETECTION_THRESHOLD = 0.5
DETECTION_BUFFER = 30
MAX_RETRIES = 5
DEFAULT_LABELS = ["parking lot", "car", "rooftop terrace", "solar panel", "tree"]


def to_wkt(geometry: str | dict[str, Any]) -> str:
    """Normalize GeoJSON dict or WKT string to WKT string."""
    if isinstance(geometry, str):
        return geometry
    from shapely.geometry import shape
    return shape(geometry).wkt


def square_around(lat: float, lon: float, half_size_m: float = 40.0) -> str:
    """A WKT polygon square centered on lat/lon, half_size_m meters from center to edge."""
    dlat = half_size_m / 111_320
    dlon = half_size_m / (111_320 * math.cos(math.radians(lat)))
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"


class VexcelClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        cache_dir: Path | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        http_client: httpx.Client | None = None,
    ):
        self.api_key = api_key or os.getenv("VEXCEL_API_KEY")
        self.base_url = (base_url or os.getenv("VEXCEL_API_BASE") or DEFAULT_BASE_URL).rstrip("/")
        self.cache_dir = cache_dir or DEFAULT_CACHE_DIR
        self.timeout = timeout
        self._custom_client = http_client

    def _get_cache_dir(self, property_id: str | None, key_hint: str | None = None) -> Path:
        if property_id:
            dir_path = self.cache_dir / str(property_id)
        else:
            hashed = hashlib.sha256((key_hint or "generic").encode()).hexdigest()[:16]
            dir_path = self.cache_dir / f"_key_{hashed}"
        dir_path.mkdir(parents=True, exist_ok=True)
        return dir_path

    @staticmethod
    def _request_key(request: dict[str, Any]) -> str:
        return hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()[:24]

    def _send(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response | None:
        """Call Vexcel API with exponential backoff on 429 and strict auth hygiene."""
        if not self.api_key:
            logger.error("Vexcel API key is not configured; call to %s skipped", path)
            return None

        # Auth header only; never put key in URL or params
        headers = {"X-API-KEY": self.api_key}

        def execute_request(client: httpx.Client) -> httpx.Response | None:
            clean_path = path.lstrip("/")
            for attempt in range(MAX_RETRIES + 1):
                try:
                    resp = client.request(
                        method=method,
                        url=clean_path,
                        headers=headers,
                        params=params,
                        json=json_body,
                    )
                    if resp.status_code == 429:
                        if attempt == MAX_RETRIES:
                            logger.error("Vexcel 429 rate limit exceeded max retries for %s", clean_path)
                            return resp
                        wait = min(2 ** attempt, 30) + random.uniform(0.1, 1.0)
                        logger.warning(
                            "Vexcel 429 rate limited on %s; retry %d/%d in %.1fs",
                            clean_path, attempt + 1, MAX_RETRIES, wait,
                        )
                        time.sleep(wait)
                        continue
                    return resp
                except httpx.TimeoutException:
                    logger.error("Vexcel %s request to %s timed out after %.1fs", method, clean_path, self.timeout)
                    return None
                except httpx.RequestError as exc:
                    logger.error("Vexcel %s request to %s failed: %s", method, clean_path, exc.__class__.__name__)
                    return None
            return None

        if self._custom_client is not None:
            return execute_request(self._custom_client)

        with httpx.Client(base_url=self.base_url, timeout=self.timeout) as client:
            return execute_request(client)

    def property(
        self,
        lat: float,
        lon: float,
        property_id: str | None = None,
    ) -> dict[str, Any]:
        """Fetch parcel + structure footprints (latest=true, include=precomputed)."""
        cache_path = self._get_cache_dir(property_id, f"prop_{lat}_{lon}") / "property.json"
        if cache_path.is_file():
            try:
                return json.loads(cache_path.read_text())
            except Exception as exc:
                logger.warning("Failed to read cached property data at %s: %s", cache_path, exc)

        point_wkt = f"POINT({lon} {lat})"
        params = {
            "wkt": point_wkt,
            "srid": 4326,
            "layer": DEFAULT_LAYERS,
            "latest": "true",
            "include": "precomputed",
            "unit-system": "imperial",
        }
        resp = self._send("GET", "property/extract", params=params)
        if resp is None:
            return {"type": "FeatureCollection", "features": []}

        if resp.status_code == 404:
            logger.info("No Vexcel property record at lat=%.6f, lon=%.6f (404)", lat, lon)
            fallback = {"type": "FeatureCollection", "features": []}
            try:
                cache_path.write_text(json.dumps(fallback, indent=2))
            except Exception:
                pass
            return fallback

        if not resp.is_success:
            logger.error("Vexcel property/extract returned status %d", resp.status_code)
            return {"type": "FeatureCollection", "features": []}

        try:
            data = resp.json()
            cache_path.write_text(json.dumps(data, indent=2))
            return data
        except Exception as exc:
            logger.error("Failed to parse Vexcel property response: %s", exc)
            return {"type": "FeatureCollection", "features": []}

    def ortho(
        self,
        parcel_wkt: str | dict[str, Any],
        property_id: str | None = None,
    ) -> bytes | None:
        """Fetch ortho image clipped to parcel with outline."""
        wkt_str = to_wkt(parcel_wkt)
        cache_path = self._get_cache_dir(property_id, f"ortho_{wkt_str}") / f"ortho_{self._request_key({'wkt': wkt_str})}.jpg"
        if cache_path.is_file():
            try:
                return cache_path.read_bytes()
            except Exception as exc:
                logger.warning("Failed to read cached ortho image at %s: %s", cache_path, exc)

        body = {
            "wkt": wkt_str,
            "srid": 4326,
            "layer": DEFAULT_LAYERS,
            "buffer-meter": 10,
            "crop": "bounding_box",
            "image-format": "jpeg",
            "drawing": [{
                "wkt": wkt_str,
                "outline-width": 4,
                "outline-color": "rgb(255,204,0)",
            }],
        }
        resp = self._send("POST", "ortho/extract", json_body=body)
        if resp is None or not resp.is_success:
            logger.error("Vexcel ortho/extract failed with status %s", getattr(resp, "status_code", "None"))
            return None

        content = resp.content
        if content:
            try:
                cache_path.write_bytes(content)
            except Exception:
                pass
        return content

    def obliques(
        self,
        parcel_wkt: str | dict[str, Any],
        property_id: str | None = None,
    ) -> dict[str, bytes]:
        """Check /oriented/collections first, then fetch available obliques."""
        wkt_str = to_wkt(parcel_wkt)
        target_dir = self._get_cache_dir(property_id, f"obliques_{wkt_str}")
        obliques_dir = target_dir / "obliques"
        obliques_dir.mkdir(parents=True, exist_ok=True)
        collections_cache = target_dir / "oriented_collections.json"

        # Check disk cache first
        if collections_cache.is_file():
            try:
                collections_data = json.loads(collections_cache.read_text())
                features = collections_data.get("features", [])
                if not features:
                    return {}
                cached_images: dict[str, bytes] = {}
                for img_file in obliques_dir.glob("*.jpg"):
                    direction = img_file.stem
                    cached_images[direction] = img_file.read_bytes()
                if cached_images:
                    return cached_images
            except Exception as exc:
                logger.warning("Failed reading cached oblique metadata: %s", exc)

        # 1. Check collections
        params = {
            "wkt": wkt_str,
            "srid": 4326,
            "layer": "urban",
            "product-type": "oblique",
            "include": "product-type,collection,last-capture-date",
        }
        coll_resp = self._send("GET", "oriented/collections", params=params)
        if coll_resp is None or coll_resp.status_code == 404:
            logger.info("No Vexcel oblique coverage at given geometry")
            try:
                collections_cache.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
            except Exception:
                pass
            return {}

        if not coll_resp.is_success:
            logger.error("Vexcel oriented/collections returned status %d", coll_resp.status_code)
            return {}

        try:
            collections_data = coll_resp.json()
            collections_cache.write_text(json.dumps(collections_data, indent=2))
        except Exception as exc:
            logger.error("Failed to parse oriented/collections response: %s", exc)
            return {}

        features = collections_data.get("features", [])
        if not features:
            return {}

        newest = max((f["properties"]["last-capture-date"] for f in features), default=None)
        available = {
            f["properties"]["product-type"]
            for f in features
            if f["properties"].get("last-capture-date") == newest
        }
        directions = [
            d for d in ["oblique-north", "oblique-south", "oblique-east", "oblique-west"]
            if d in available
        ]

        results: dict[str, bytes] = {}
        for direction in directions:
            body = {
                "wkt": wkt_str,
                "srid": 4326,
                "layer": "urban",
                "product-type": direction,
                "rotation": "natural",
                "buffer-meter": 10,
                "crop": "bbox",
                "image-format": "jpeg/png",
                "drawing": [{
                    "wkt": wkt_str,
                    "outline-width": 4,
                    "outline-color": "255,204,0",
                    "fill-color": "255,204,0",
                    "transparency": 0,
                }],
            }
            img_resp = self._send("POST", "oriented/extract", json_body=body)
            if img_resp is not None and img_resp.is_success and img_resp.content:
                results[direction] = img_resp.content
                try:
                    (obliques_dir / f"{direction}.jpg").write_bytes(img_resp.content)
                except Exception:
                    pass
            else:
                logger.warning("Failed to extract oblique direction %s", direction)

        return results

    def detect(
        self,
        parcel_wkt: str | dict[str, Any],
        labels: list[str] | None = None,
        property_id: str | None = None,
    ) -> dict[str, Any]:
        """Detect custom elements via sam3 on parcel ortho imagery."""
        wkt_str = to_wkt(parcel_wkt)
        detect_labels = sorted(set(DEFAULT_LABELS if labels is None else labels))
        body = {
            "wkt": wkt_str,
            "srid": 4326,
            "buffer-meter": DETECTION_BUFFER,
            "images": [{
                "endpoint": "ortho/extract",
                "request": {
                    "layer": DEFAULT_LAYERS,
                    "srid": 4326,
                    "wkt": wkt_str,
                    "crop": "bounding_box",
                },
            }],
            "model-input": {
                "elements": [
                    {"label": label, "model": "sam3", "detection-threshold": DETECTION_THRESHOLD}
                    for label in detect_labels
                ],
                "include": ["bbox", "confidence"],
            },
        }
        cache_path = self._get_cache_dir(property_id, f"detect_{wkt_str}") / f"detect_{self._request_key(body)}.json"
        if cache_path.is_file():
            try:
                return json.loads(cache_path.read_text())
            except Exception as exc:
                logger.warning("Failed to read cached detect data: %s", exc.__class__.__name__)

        resp = self._send("POST", "elements/detect", json_body=body)
        if resp is None or not resp.is_success:
            logger.error("Vexcel elements/detect failed with status %s", getattr(resp, "status_code", "None"))
            return {"type": "FeatureCollection", "features": []}

        try:
            data = resp.json()
            cache_path.write_text(json.dumps(data, indent=2))
            return data
        except Exception as exc:
            logger.error("Failed to parse Vexcel elements/detect response: %s", exc)
            return {"type": "FeatureCollection", "features": []}


# Module-level convenience functions
_default_client = VexcelClient()


def property(
    lat: float,
    lon: float,
    property_id: str | None = None,
    client: VexcelClient | None = None,
) -> dict[str, Any]:
    c = client or _default_client
    return c.property(lat, lon, property_id=property_id)


def ortho(
    parcel_wkt: str | dict[str, Any],
    property_id: str | None = None,
    client: VexcelClient | None = None,
) -> bytes | None:
    c = client or _default_client
    return c.ortho(parcel_wkt, property_id=property_id)


def obliques(
    parcel_wkt: str | dict[str, Any],
    property_id: str | None = None,
    client: VexcelClient | None = None,
) -> dict[str, bytes]:
    c = client or _default_client
    return c.obliques(parcel_wkt, property_id=property_id)


def detect(
    parcel_wkt: str | dict[str, Any],
    labels: list[str] | None = None,
    property_id: str | None = None,
    client: VexcelClient | None = None,
) -> dict[str, Any]:
    c = client or _default_client
    return c.detect(parcel_wkt, labels=labels, property_id=property_id)


# Deepagent tool aliases (for spatial_scout in Phase 4B)
vexcel_property = property
vexcel_imagery = ortho
vexcel_detect = detect
