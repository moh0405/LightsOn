"""Matterport adapter for Lights On.

docs/vendor/matterport does not exist yet (pending credentials zip), so this adapter
returns the kit's Matterport model IDs and captions from the local office index / dossier media.
Maintains the standard external adapter contract: timeout, typed fallback, logged error, never raises.
"""
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INDEX = ROOT / "data/costar/index.sqlite"
DEFAULT_DOSSIERS = ROOT / "server/fixtures/dossiers"


class MatterportClient:
    def __init__(
        self,
        index_path: Path | None = None,
        dossiers_dir: Path | None = None,
        timeout: float = 30.0,
    ):
        self.index_path = index_path or DEFAULT_INDEX
        self.dossiers_dir = dossiers_dir or DEFAULT_DOSSIERS
        self.timeout = timeout

    def get_models(self, property_id: str) -> list[dict[str, Any]]:
        """Return Matterport model IDs and captions for a property."""
        if not property_id or not str(property_id).isdecimal():
            return []

        # 1. Try local sqlite index if available
        if self.index_path.is_file():
            try:
                with sqlite3.connect(f"file:{self.index_path}?mode=ro", uri=True, timeout=self.timeout) as db:
                    rows = db.execute(
                        "SELECT model_id FROM matterport WHERE property_id=? ORDER BY model_id",
                        (str(property_id),),
                    ).fetchall()
                    if rows:
                        return [{"model_id": r[0], "caption": None} for r in rows]
            except Exception as exc:
                logger.warning("Failed to query Matterport models from index: %s", exc)

        # 2. Fall back to prepared fixture dossier
        dossier_path = self.dossiers_dir / f"{property_id}.json"
        if dossier_path.is_file():
            try:
                import json
                data = json.loads(dossier_path.read_text())
                media_models = data.get("media", {}).get("matterport", [])
                if media_models:
                    return media_models
            except Exception as exc:
                logger.error("Failed to read Matterport models from dossier %s: %s", dossier_path, exc)

        return []

    def get_model(self, model_id: str) -> dict[str, Any] | None:
        """Return model metadata or None if unknown."""
        if not model_id:
            return None
        return {"model_id": model_id, "caption": None}


# Module-level convenience functions
_default_client = MatterportClient()


def get_models(property_id: str) -> list[dict[str, Any]]:
    return _default_client.get_models(property_id)


def get_model(model_id: str) -> dict[str, Any] | None:
    return _default_client.get_model(model_id)


# Deepagent tool alias
matterport_get_model = get_models
