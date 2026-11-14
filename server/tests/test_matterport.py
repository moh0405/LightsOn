"""Unit tests for Matterport adapter."""
import pytest
from app.data.matterport import MatterportClient, get_models, get_model


def test_matterport_get_models_for_hero():
    models = get_models("233953")
    assert isinstance(models, list)
    assert len(models) >= 1
    # Check that model objects have model_id and caption
    for m in models:
        assert "model_id" in m
        assert "caption" in m


def test_matterport_unknown_property_returns_empty():
    models = get_models("999999999")
    assert models == []


def test_matterport_invalid_id_returns_empty():
    assert get_models("") == []
    assert get_models("invalid-id") == []


def test_matterport_get_single_model():
    model = get_model("Wtxv2Mp8uQE")
    assert model is not None
    assert model["model_id"] == "Wtxv2Mp8uQE"
    assert get_model("") is None
