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
    requests = []
    def handler(request):
        requests.append(request)
        if request.url.path.endswith('oriented/collections'):
            return httpx.Response(200, json={'features': [{'properties': {
                'product-type': 'oblique-north', 'last-capture-date': '2023-08-02'}}]})
        if request.url.path.endswith('extract') and not request.url.path.endswith('property/extract'):
            return httpx.Response(200, content=b'recorded-test-image')
        return httpx.Response(200, json={'features': []})
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url='https://test.invalid/v2/')
    client = VexcelClient(api_key='test', cache_dir=tmp_path, http_client=http)
    geometry = square_around(29.7588018, -95.3650891)
    def fetch():
        return (client.property(29.7588018, -95.3650891, property_id=pid),
                client.ortho(geometry, property_id=pid),
                client.obliques(geometry, property_id=pid),
                client.detect(geometry, property_id=pid))
    first = fetch()
    assert len(requests) == 5
    assert fetch() == first
    assert len(requests) == 5


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


@pytest.mark.parametrize('change', ['labels', 'geometry', 'threshold', 'buffer'])
def test_detection_cache_keys_all_request_inputs(tmp_path, monkeypatch, change):
    import app.data.vexcel as adapter
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={'features': [], 'request_number': len(requests)})
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url='https://test.invalid/v2/')
    client = VexcelClient(api_key='test', cache_dir=tmp_path, http_client=http)
    geometry = square_around(29.7588018, -95.3650891)
    first = client.detect(geometry, labels=['car', 'tree'], property_id='233953')
    assert client.detect(geometry, labels=['tree', 'car'], property_id='233953') == first
    assert len(requests) == 1
    labels, pid = ['car', 'tree'], '233953'
    if change == 'labels': labels = ['tree']
    if change == 'geometry': geometry = square_around(29.7588018, -95.3650891, 50)
    if change == 'property': pid = '233899'
    if change == 'threshold': monkeypatch.setattr(adapter, 'DETECTION_THRESHOLD', 0.75, raising=False)
    if change == 'buffer': monkeypatch.setattr(adapter, 'DETECTION_BUFFER', 0, raising=False)
    assert client.detect(geometry, labels=labels, property_id=pid)['request_number'] == 2
    assert len(requests) == 2


def test_ortho_cache_changes_with_geometry(tmp_path):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, content=f'image-{len(requests)}'.encode())
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url='https://test.invalid/v2/')
    client = VexcelClient(api_key='test', cache_dir=tmp_path, http_client=http)
    geometry = square_around(29.7588018, -95.3650891)
    assert client.ortho(geometry, property_id='233953') == b'image-1'
    assert client.ortho(geometry, property_id='233953') == b'image-1'
    assert client.ortho(square_around(29.7588018, -95.3650891, 50), property_id='233953') == b'image-2'


@pytest.mark.parametrize('failure', ['timeout', 'transport', 'missing-key'])
def test_oblique_transient_failure_is_not_cached(tmp_path, failure):
    calls = []
    def handler(request):
        calls.append(request.url.path)
        if len(calls) == 1 and failure != 'missing-key':
            error = httpx.ReadTimeout if failure == 'timeout' else httpx.ConnectError
            raise error('offline', request=request)
        if request.url.path.endswith('oriented/collections'):
            return httpx.Response(200, json={'features': [{'properties': {
                'product-type': 'oblique-north', 'last-capture-date': '2023-08-02'}}]})
        return httpx.Response(200, content=b'north-image')
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url='https://test.invalid/v2/')
    client = VexcelClient(api_key='test', cache_dir=tmp_path, http_client=http)
    if failure == 'missing-key': client.api_key = None
    geometry = square_around(29.7588018, -95.3650891)
    assert client.obliques(geometry, property_id='233953') == {}
    client.api_key = 'test'
    assert client.obliques(geometry, property_id='233953') == {'oblique-north': b'north-image'}
    assert calls[-2:] == ['/v2/oriented/collections', '/v2/oriented/extract']


def test_partial_oblique_cache_retries_only_missing_directions(tmp_path):
    calls = []
    fail_south = True
    def handler(request):
        calls.append(request)
        if request.url.path.endswith('oriented/collections'):
            assert request.url.params['srid'] == '4326'
            return httpx.Response(200, json={'features': [{'properties': {
                'product-type': direction, 'last-capture-date': '2023-08-02'}}
                for direction in ['oblique-north', 'oblique-south']]})
        body = json.loads(request.content)
        assert body['srid'] == 4326
        assert body['rotation'] == 'natural'
        assert body['drawing'][0]['outline-color'] == '255,204,0'
        if fail_south and body['product-type'] == 'oblique-south':
            return httpx.Response(503)
        return httpx.Response(200, content=body['product-type'].encode())
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url='https://test.invalid/v2/')
    client = VexcelClient(api_key='test', cache_dir=tmp_path, http_client=http)
    geometry = square_around(29.7588018, -95.3650891)
    assert set(client.obliques(geometry, property_id='233953')) == {'oblique-north'}
    assert [r.url.path for r in calls] == ['/v2/oriented/collections', '/v2/oriented/extract', '/v2/oriented/extract']
    fail_south = False
    assert set(client.obliques(geometry, property_id='233953')) == {'oblique-north', 'oblique-south'}
    assert len(calls) == 4
    assert json.loads(calls[-1].content)['product-type'] == 'oblique-south'
    assert len(client.obliques(geometry, property_id='233953')) == 2
    assert len(calls) == 4
