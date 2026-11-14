import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from fastapi import FastAPI

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

app = FastAPI(title="Lights On")


def env_example_keys() -> list[str]:
    """Names of every key declared in .env.example (values are never read)."""
    return [k for k in dotenv_values(REPO_ROOT / ".env.example")]


def build_health() -> dict:
    data_dir = Path(os.getenv("COSTAR_DATA_DIR") or "./data/costar")
    if not data_dir.is_absolute():
        data_dir = REPO_ROOT / data_dir
    return {
        "ok": True,
        "data_mode": os.getenv("DATA_MODE") or "kit",
        # presence only (true/false), never the value
        "keys": {k: bool(os.getenv(k)) for k in env_example_keys()},
        "costar_property_file": (data_dir / "data" / "commercial-property.jsonl").is_file(),
    }


@app.get("/api/health")
def health() -> dict:
    return build_health()
