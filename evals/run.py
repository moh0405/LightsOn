#!/usr/bin/env python3
"""Network-free prep grounding and budget regression eval; live judging is Phase 5."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--quick', action='store_true', help='Run offline prep safety checks')
parser.parse_args()
raise SystemExit(subprocess.call([sys.executable, '-m', 'pytest', 'tests/test_prep_agent.py', '-q'], cwd=ROOT / 'server'))
