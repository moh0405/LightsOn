"""Optional ElevenLabs adapter; silence with subtitles is the standard fallback."""
from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[3]
log = logging.getLogger(__name__)


def render_intro(persona: dict, *, client: httpx.Client | None = None) -> str | None:
    key = os.getenv('ELEVENLABS_API_KEY')
    voice = persona.get('voice_id') or os.getenv('ELEVENLABS_VOICE_ID')
    if not key or not voice:
        return None
    if not voice.isalnum():
        log.error('ElevenLabs voice identifier invalid; using subtitles')
        return None
    text = persona['intro_line']
    digest = hashlib.sha256(f'{voice}:{text}'.encode()).hexdigest()
    path = ROOT / 'server/cache/tts' / f'{digest}.mp3'
    if path.is_file():
        return f'/api/tts/{digest}.mp3'
    try:
        def request(http):
            return http.post(f'https://api.elevenlabs.io/v1/text-to-speech/{voice}',
                headers={'xi-api-key': key, 'Accept': 'audio/mpeg'},
                json={'text': text, 'model_id': 'eleven_multilingual_v2'}, timeout=15)
        if client is None:
            with httpx.Client() as http:
                response = request(http)
        else:
            response = request(client)
        response.raise_for_status()
        if not response.content or 'audio/' not in response.headers.get('content-type', ''):
            raise ValueError('Audio missing')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
        return f'/api/tts/{digest}.mp3'
    except Exception as exc:
        log.error('ElevenLabs unavailable (%s); using subtitles', type(exc).__name__)
        return None
