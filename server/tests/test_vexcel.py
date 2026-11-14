"""Unit tests for Vexcel API adapter."""
import json
import os
import time
from pathlib import Path
import httpx
import pytest

from app.data.vexcel import VexcelClient, property as vexcel_property, ortho as vexcel_ortho, obliques as vexcel_obliques, detect as vexcel_detect, to_wkt, square_around


def test_auth_header_set_and_never_in_url(tmp_path):
    recorded_requests: list[httpx.Request] = []
    secret_key = "secret-test-vexcel-key-12345"

    def handler(request: httpx.Request) -> httpx.Response:
        recorded_requests.append(request)
        # Verify secret key is in header
        assert request.headers.get("X-API-KEY") == secret_key
        # Verify secret key is NEVER in URL or query params
        assert secret_key not in str(request.url)
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.vexcelgroup.com/v2")
    vclient = VexcelClient(api_key=secret_key, cache_dir=tmp_path, http_client=client)

    result = vclient.property(29.7588, -95.3651, property_id="test_pid")
    assert result == {"type": "FeatureCollection", "features": []}
    assert len(recorded_requests) == 1
    assert "X-API-KEY" in recorded_requests[0].headers
    assert secret_key not in str(recorded_requests[0].url)


def test_429_backoff_and_retry(tmp_path, monkeypatch):
    # Avoid real sleep in tests
    sleep_calls = []
    monkeypatch.setattr(time, "sleep", lambda s: sleep_calls.append(s))

    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            return httpx.Response(429, headers={"Retry-After": "1"}, text="Too Many Requests")
        return httpx.Response(200, json={"type": "FeatureCollection", "features": [{"id": "success"}]})

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.vexcelgroup.com/v2")
    vclient = VexcelClient(api_key="test-key", cache_dir=tmp_path, http_client=client)

    result = vclient.property(29.7588, -95.3651, property_id="retry_prop")
    assert attempts == 3
    assert len(sleep_calls) == 2
    assert result.get("features", [])[0]["id"] == "success"


def test_timeout_fallback(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("Read timed out", request=request)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.vexcelgroup.com/v2")
    vclient = VexcelClient(api_key="test-key", cache_dir=tmp_path, http_client=client)

    # Every method must return a typed fallback, never raise into caller
    prop = vclient.property(29.7588, -95.3651, property_id="timeout_prop")
    assert prop == {"type": "FeatureCollection", "features": []}

    ortho_img = vclient.ortho("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))", property_id="timeout_prop")
    assert ortho_img is None

    obls = vclient.obliques("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))", property_id="timeout_prop")
    assert obls == {}

    det = vclient.detect("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))", property_id="timeout_prop")
    assert det == {"type": "FeatureCollection", "features": []}


def test_cache_hit_makes_no_call(tmp_path):
    pid = "233953"
    cache_dir = tmp_path / pid
    cache_dir.mkdir(parents=True)

    # Pre-populate cache
    (cache_dir / "property.json").write_text(json.dumps({"cached": True, "features": []}))
    (cache_dir / "ortho.jpg").write_bytes(b"fake-ortho-bytes")
    (cache_dir / "oriented_collections.json").write_text(json.dumps({
        "features": [{"properties": {"product-type": "oblique-north", "last-capture-date": "2025-01-01"}}]
    }))
    obliques_dir = cache_dir / "obliques"
    obliques_dir.mkdir()
    (obliques_dir / "oblique-north.jpg").write_bytes(b"fake-oblique-bytes")
    (cache_dir / "detect.json").write_text(json.dumps({"cached": True, "detections": []}))

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"Unexpected network call made on cache hit: {request.url}")

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.vexcelgroup.com/v2")
    vclient = VexcelClient(api_key="test-key", cache_dir=tmp_path, http_client=client)

    # Calls should hit cache with ZERO network requests
    prop = vclient.property(29.7588, -95.3651, property_id=pid)
    assert prop.get("cached") is True

    img = vclient.ortho("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))", property_id=pid)
    assert img == b"fake-ortho-bytes"

    obls = vclient.obliques("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))", property_id=pid)
    assert "oblique-north" in obls
    assert obls["oblique-north"] == b"fake-oblique-bytes"

    det = vclient.detect("POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))", property_id=pid)
    assert det.get("cached") is True


def test_fact_building_estimate_kind_and_capture_date():
    dossier_path = Path(__file__).resolve().parents[1] / "fixtures/dossiers/233953.json"
    assert dossier_path.is_file()
    dossier = json.loads(dossier_path.read_text())
    
    vexcel_facts = [f for f in dossier["facts"] if f.get("source") == "vexcel+vision"]
    assert len(vexcel_facts) > 0

    car_fact = next(f for f in vexcel_facts if f["key"] == "vexcel_detection_car")
    assert car_fact["kind"] == "estimate"
    assert car_fact["source"] == "vexcel+vision"
    assert car_fact["source_field"] == "vexcel.elements/detect"
    assert "on the 2023 flyover" in car_fact["say_as"]
    assert car_fact["value"] == 31


def test_footprint_merge_replaces_approx():
    dossier_path = Path(__file__).resolve().parents[1] / "fixtures/dossiers/233953.json"
    dossier = json.loads(dossier_path.read_text())
    assert dossier.get("footprint") is not None
    assert dossier["footprint"]["source"] == "vexcel"
    assert dossier["footprint"]["type"] == "Polygon"
    assert len(dossier["footprint"]["coordinates"]) > 0

    # Also verify floors.geojson has footprint_source vexcel for this hero
    floors_path = Path(__file__).resolve().parents[2] / "apps/web/public/floors.geojson"
    floors = json.loads(floors_path.read_text())
    hero_floors = [f for f in floors["features"] if f["properties"]["building_id"] == "233953"]
    assert len(hero_floors) == 27
    for f in hero_floors:
        assert f["footprint_source"] == "vexcel"


def test_esperson_unchanged():
    dossier_path = Path(__file__).resolve().parents[1] / "fixtures/dossiers/233953.json"
    dossier = json.loads(dossier_path.read_text())
    
    # Esperson floors 6-8 stay dark, 31,503
    dark_floors = {f["number"]: f for f in dossier["floors"] if f["number"] in (6, 7, 8)}
    assert len(dark_floors) == 3
    for num, fl in dark_floors.items():
        assert fl["source_status"] == "dark"
        assert fl["size_sqft"] == 31503.0
        assert fl["available_sqft"] == 31503.0
        assert f"F_233953_floor_{num}_size_sqft" in fl["fact_ids"]
        assert f"F_233953_floor_{num}_available_sqft" in fl["fact_ids"]

    # Verify CoStar facts exist and values match
    f6_size = next(f for f in dossier["facts"] if f["id"] == "F_233953_floor_6_size_sqft")
    assert f6_size["value"] == 31503.0
    assert f6_size["source"] == "costar"
    assert f6_size["kind"] == "verified"


@pytest.mark.skipif(os.getenv("VEXCEL_LIVE") != "1", reason="Opt-in live smoke test behind VEXCEL_LIVE=1")
def test_vexcel_live_smoke():
    """Live smoke test verifying actual Vexcel API responses for Esperson hero."""
    client = VexcelClient()
    assert client.api_key is not None, "VEXCEL_API_KEY required for live smoke test"
    # Esperson coordinates
    prop = client.property(29.7588018, -95.3650891, property_id="233953")
    assert "features" in prop
    assert len(prop["features"]) > 0
    primary_structs = [
        s for s in prop["features"][0]["properties"].get("structures", [])
        if s.get("primary-structure")
    ]
    assert len(primary_structs) == 1
    assert "footprint.wkt" in primary_structs[0]
