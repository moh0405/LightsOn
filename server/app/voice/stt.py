"""Optional STT; never logs recordings, transcripts, provider bodies or keys."""
import logging
import os

import httpx

log = logging.getLogger(__name__)
MAX_AUDIO = 5 * 1024 * 1024


class SpeechUnavailable(Exception):
    pass


def transcribe(audio: bytes, content_type: str, *, client: httpx.Client | None = None) -> str:
    key = os.getenv('ELEVENLABS_API_KEY')
    if not key:
        log.info('ElevenLabs STT not configured; use browser recognition or typing')
        raise SpeechUnavailable()
    try:
        def request(http):
            response = http.post('https://api.elevenlabs.io/v1/speech-to-text',
                                 headers={'xi-api-key': key}, data={'model_id': 'scribe_v2'},
                                 files={'file': ('pitch', audio, content_type)}, timeout=15)
            response.raise_for_status()
            text = response.json().get('text')
            if not isinstance(text, str) or not text.strip():
                raise ValueError('No transcript')
            return text.strip()
        if client is None:
            with httpx.Client() as http:
                return request(http)
        return request(client)
    except Exception as exc:
        log.error('ElevenLabs STT unavailable (%s); use browser recognition or typing', type(exc).__name__)
        raise SpeechUnavailable() from None
