"""Building-scoped, contact-free research tools over prepared source evidence."""
from __future__ import annotations

import copy
import json
import re
from pathlib import Path

from ..data import matterport, vexcel
from ..data.provider import DataProvider, get_provider

ROOT = Path(__file__).resolve().parents[3]
PROPERTY_KEYS = {
    'buildingName', 'numStoriesAboveGrade', 'buildingHeightInFeet',
    'rentableBuildingAreaSquareFeet', 'grossTypicalFloorSquareFeet', 'parkingRatio',
    'propertyType', 'buildingClass', 'yearBuilt', 'yearRenovated', 'address',
    'latitude', 'longitude', 'available_sqft', 'occupied_sqft',
}
HISTORY_KEYS = {'tenant_records', 'current_tenants', 'tenant_industries', 'tenant_exit_reasons'}


def detection_facts(property_id: str, evidence: dict) -> list[dict]:
    """Absence in an aerial detection is not evidence of physical absence."""
    date = evidence.get('capture_dates', {}).get('ortho')
    result = []
    for detection in evidence.get('detections', []):
        label, count = detection.get('label'), detection.get('count')
        if label not in {'car', 'tree', 'parking lot', 'rooftop terrace', 'solar panel'}:
            continue
        if not isinstance(count, int) or count <= 0:
            continue
        noun = label if count == 1 else label + 's'
        when = f'on the {date[:4]} flyover' if date else 'in imagery with an unknown capture date'
        result.append(dict(id=f'F_{property_id}_vexcel_detection_{label.replace(" ", "_")}',
            key=f'vexcel_detection_{label.replace(" ", "_")}', value=count, unit='count',
            source='vexcel+vision', source_field='vexcel.elements/detect', kind='estimate',
            say_as=f'{when}, looks like {count} {noun} detected'))
    return result


class BuildingTools:
    def __init__(self, property_id: str, provider: DataProvider | None = None):
        self.provider = provider or get_provider()
        self.dossier = self.provider.dossier(property_id)
        if self.dossier is None:
            raise ValueError('Unknown building')
        self.property_id = property_id
        self.dossier = copy.deepcopy(self.dossier)
        # Select known schema fields, rather than recursively trusting arbitrary dossier fields.
        self.facts = []
        for fact in self.dossier['facts']:
            key = fact['key']
            if (key in PROPERTY_KEYS | HISTORY_KEYS | {'matterport_models'}
                    or re.fullmatch(r'floor_(?:-?\d+|id_\d+)_(?:size|available|occupied)_sqft', key)
                    or key in {'construction_ConstructionComplete', 'construction_RenovationFinished',
                               'construction_CommonAreaRenovated'}):
                self.facts.append({k: fact.get(k) for k in
                    ('id', 'key', 'value', 'unit', 'source', 'source_field', 'kind', 'say_as')})
        path = ROOT / f'server/fixtures/vexcel/{property_id}.json'
        self.evidence = json.loads(path.read_text()) if path.is_file() else {}
        self.facts += detection_facts(property_id, self.evidence)

    def kit_get_building(self) -> dict:
        """Read office building facts; missing values remain null."""
        return {'id': self.property_id, 'facts': [f for f in self.facts
            if f['key'] in PROPERTY_KEYS or f['key'].startswith('construction_')]}

    def kit_get_floor_status(self) -> dict:
        """Read source floor status and areas without inferring missing occupancy."""
        return {'floors': [{k: f.get(k) for k in ('number', 'source_status', 'size_sqft',
            'available_sqft', 'occupied_sqft', 'fact_ids')} for f in self.dossier['floors']],
            'facts': [f for f in self.facts if f['key'].startswith('floor_')]}

    def kit_get_tenant_history(self) -> dict:
        """Read aggregate tenancy history and decoded industries, never tenant identities."""
        return {'facts': [f for f in self.facts if f['key'] in HISTORY_KEYS]}

    def kit_get_matterport_models(self) -> dict:
        """Read only model IDs and captions from the source dossier."""
        return {'models': [{'model_id': m.get('model_id'), 'caption': m.get('caption')}
            for m in self.dossier.get('media', {}).get('matterport', [])]}

    def vexcel_property(self) -> dict:
        """Read cached Phase 4A Vexcel footprint, or use the timed adapter in kit mode."""
        if self.evidence:
            return {'footprint': self.evidence.get('footprint')}
        if self.dossier.get('data_mode') == 'kit':
            result = vexcel.property(self.dossier['lat'], self.dossier['lng'], property_id=self.property_id)
            return {'status': 'available' if result else 'unavailable'}
        return {'status': 'unavailable'}

    def vexcel_imagery(self) -> dict:
        """Read cached imagery paths and capture dates; image presence proves no interior facts."""
        return {'images': self.evidence.get('images'), 'capture_dates': self.evidence.get('capture_dates'),
                'status': 'available' if self.evidence.get('images') else 'unavailable'}

    def vexcel_detect(self) -> dict:
        """Read positive, dated aerial estimates only; never claim an absent detection."""
        return {'facts': detection_facts(self.property_id, self.evidence),
                'status': 'available' if self.evidence else 'unavailable'}

    def matterport_get_model(self) -> dict:
        """Wrap the Matterport adapter; interior measurements remain unavailable without a zip."""
        known = self.kit_get_matterport_models()['models']
        return {'models': [matterport.get_model(m['model_id']) for m in known],
                'interior_measurements': None}

    def functions(self) -> list:
        return [self.kit_get_building, self.kit_get_floor_status, self.kit_get_tenant_history,
                self.kit_get_matterport_models, self.vexcel_property, self.vexcel_imagery,
                self.vexcel_detect, self.matterport_get_model]
