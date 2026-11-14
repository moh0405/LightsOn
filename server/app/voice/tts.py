"""Bounded ElevenLabs streaming adapter; browser speech is the free fallback."""
from __future__ import annotations

import hashlib
import logging
import os
import re
import tempfile
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / 'server/cache/tts'
log = logging.getLogger(__name__)
CACHE_MAX_BYTES = 200 * 1024 * 1024


def prune_cache() -> None:
    """Keep the on-disk voice cache bounded: drop the oldest clips first."""
    try:
        clips = sorted(((p.stat().st_mtime, p.stat().st_size, p) for p in CACHE.glob('*.mp3')), reverse=True)
    except OSError as exc:
        log.error('TTS cache prune failed (%s)', type(exc).__name__)
        return
    total = 0
    for _, size, path in clips:
        total += size
        if total > CACHE_MAX_BYTES:
            path.unlink(missing_ok=True)


def render_speech(text: str, voice_id: str = '', *, client: httpx.Client | None = None) -> str | None:
    key = os.getenv('ELEVENLABS_API_KEY')
    voice = voice_id or os.getenv('ELEVENLABS_VOICE_ID', '')
    if not key or not voice:
        return None
    if not re.fullmatch(r'[A-Za-z0-9]{1,128}', voice):
        log.error('ElevenLabs voice identifier invalid; using browser speech')
        return None
    digest = hashlib.sha256(f'{voice}:{text}'.encode()).hexdigest()
    path = CACHE / f'{digest}.mp3'
    url = f'/api/tts/{digest}.mp3'
    if path.is_file():
        return url
    temporary = None
    try:
        def request(http):
            nonlocal temporary
            with http.stream('POST', f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream',
                             headers={'xi-api-key': key, 'Accept': 'audio/mpeg'},
                             json={'text': text, 'model_id': 'eleven_multilingual_v2'}, timeout=15) as response:
                response.raise_for_status()
                if not response.headers.get('content-type', '').startswith('audio/'):
                    raise ValueError('Audio missing')
                CACHE.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(dir=CACHE, suffix='.tmp', delete=False) as output:
                    temporary = Path(output.name)
                    size = 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > 10 * 1024 * 1024:
                            raise ValueError('Audio too large')
                        output.write(chunk)
                    if not size:
                        raise ValueError('Audio missing')
                temporary.replace(path)
                prune_cache()
        if client is None:
            with httpx.Client() as http:
                request(http)
        else:
            request(client)
        return url
    except Exception as exc:
        log.error('ElevenLabs TTS unavailable (%s); using browser speech', type(exc).__name__)
        return None
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def render_intro(persona: dict, *, client: httpx.Client | None = None) -> str | None:
    return render_speech(persona['intro_line'], persona.get('voice_id', ''), client=client)
