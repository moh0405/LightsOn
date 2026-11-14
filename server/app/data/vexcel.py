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
        return dir_path

    @staticmethod
    def _collection(data: Any) -> dict[str, Any]:
        if not isinstance(data, dict) or not isinstance(data.get("features"), list):
            raise ValueError("Expected a feature collection")
        for feature in data["features"]:
            if not isinstance(feature, dict) or not isinstance(feature.get("properties", {}), dict):
                raise ValueError("Invalid feature")
            detections = feature.get("properties", {}).get("detections", [])
            if not isinstance(detections, list) or any(not isinstance(d, dict) for d in detections):
                raise ValueError("Invalid detections")
        return data

    def _read_bytes(self, path: Path) -> bytes | None:
        try:
            return path.read_bytes()
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.warning("Vexcel cache read failed: %s", exc.__class__.__name__)
            return None

    def _read_json(self, path: Path) -> dict[str, Any] | None:
        content = self._read_bytes(path)
        if content is None:
            return None
        try:
            return self._collection(json.loads(content))
        except (ValueError, TypeError) as exc:
            logger.warning("Vexcel cached JSON is malformed: %s", exc.__class__.__name__)
            return None

    def _write(self, path: Path, data: bytes | dict[str, Any]) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data if isinstance(data, bytes) else json.dumps(data, indent=2).encode())
        except OSError as exc:
            logger.warning("Vexcel cache write failed: %s", exc.__class__.__name__)

    @staticmethod
    def _directions(data: dict[str, Any]) -> list[str]:
        features = data["features"]
        dates = [f.get("properties", {}).get("last-capture-date") for f in features]
        newest = max((d for d in dates if isinstance(d, str) and d), default=None)
        if features and newest is None:
            raise ValueError("Collection has no capture date")
        available = [f.get("properties", {}).get("product-type") for f in features
                     if f.get("properties", {}).get("last-capture-date") == newest]
        directions = [d for d in ["oblique-north", "oblique-south", "oblique-east", "oblique-west"] if d in available]
        if features and not directions:
            raise ValueError("Collection has no advertised oblique direction")
        return directions

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
        cached = self._read_json(cache_path)
        if cached is not None:
            return cached

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
            self._write(cache_path, fallback)
            return fallback

        if not resp.is_success:
            logger.error("Vexcel property/extract returned status %d", resp.status_code)
            return {"type": "FeatureCollection", "features": []}

        try:
            data = self._collection(resp.json())
            self._write(cache_path, data)
            return data
        except Exception as exc:
            logger.error("Failed to parse Vexcel property response: %s", exc.__class__.__name__)
            return {"type": "FeatureCollection", "features": []}

    def ortho(
        self,
        parcel_wkt: str | dict[str, Any],
        property_id: str | None = None,
    ) -> bytes | None:
        """Fetch ortho image clipped to parcel with outline."""
        wkt_str = to_wkt(parcel_wkt)
        cache_path = self._get_cache_dir(property_id, f"ortho_{wkt_str}") / f"ortho_{self._request_key({'wkt': wkt_str})}.jpg"
        cached = self._read_bytes(cache_path)
        if cached:
            return cached

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
            self._write(cache_path, content)
        return content

    def obliques(
        self,
        parcel_wkt: str | dict[str, Any],
        property_id: str | None = None,
    ) -> dict[str, bytes]:
        """Check /oriented/collections first, then fetch available obliques."""
        wkt_str = to_wkt(parcel_wkt)
        # Geometry namespaces also prevent coverage and images from a previous parcel
        # being reused after the parcel changes. Ignore legacy incomplete caches.
        target_dir = self._get_cache_dir(property_id, f"obliques_{wkt_str}") / f"obliques_{self._request_key({'wkt': wkt_str})}"
        obliques_dir = target_dir / "images"
        collections_cache = target_dir / "oriented_collections.json"
        collections_data = self._read_json(collections_cache)
        if collections_data is not None:
            try:
                self._directions(collections_data)
            except ValueError:
                logger.warning("Vexcel cached collection has no capture date")
                collections_data = None

        if collections_data is None:
            params = {
                "wkt": wkt_str,
                "srid": 4326,
                "layer": "urban",
                "product-type": "oblique",
                "include": "product-type,collection,last-capture-date",
            }
            coll_resp = self._send("GET", "oriented/collections", params=params)
            if coll_resp is None:
                return {}
            if coll_resp.status_code == 404:
                collections_data = {"type": "FeatureCollection", "features": []}
            elif not coll_resp.is_success:
                logger.error("Vexcel oriented/collections returned status %d", coll_resp.status_code)
                return {}
            else:
                try:
                    collections_data = self._collection(coll_resp.json())
                    self._directions(collections_data)
                except Exception as exc:
                    logger.error("Failed to parse oriented/collections response: %s", exc.__class__.__name__)
                    return {}
            self._write(collections_cache, collections_data)

        directions = self._directions(collections_data)
        results: dict[str, bytes] = {}
        for direction in directions:
            image_path = obliques_dir / f"{direction}.jpg"
            cached = self._read_bytes(image_path)
            if cached:
                results[direction] = cached
                continue
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
                self._write(image_path, img_resp.content)
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
        cached = self._read_json(cache_path)
        if cached is not None:
            return cached

        resp = self._send("POST", "elements/detect", json_body=body)
        if resp is None or not resp.is_success:
            logger.error("Vexcel elements/detect failed with status %s", getattr(resp, "status_code", "None"))
            return {"type": "FeatureCollection", "features": []}

        try:
            data = self._collection(resp.json())
            self._write(cache_path, data)
            return data
        except Exception as exc:
            logger.error("Failed to parse Vexcel elements/detect response: %s", exc.__class__.__name__)
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
