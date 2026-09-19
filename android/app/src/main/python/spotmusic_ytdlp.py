import json
import re
import unicodedata

import yt_dlp


def tokens(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return set(re.findall(r'[a-z0-9]+', value)) - {'official', 'audio', 'video', 'lyrics', 'topic'}


def score(info, title, artist, expected_ms):
    actual = tokens(info.get('title') or '')
    wanted = tokens(title)
    artist_tokens = tokens(artist)
    creator = actual | tokens(info.get('artist') or info.get('uploader') or info.get('channel') or '')
    title_score = len(actual & wanted) / max(1, len(wanted))
    artist_score = len(creator & artist_tokens) / max(1, len(artist_tokens))
    duration = float(info.get('duration') or 0) * 1000
    if title_score < .8 or (artist_tokens and artist_score < .6) or duration <= 0:
        return 0
    for variant in ('cover', 'remix', 'live', 'karaoke', 'slowed', 'nightcore', 'acoustic'):
        if (variant in actual) != (variant in wanted):
            return 0
    if expected_ms > 45000 and abs(duration - expected_ms) > max(12000, expected_ms * .15):
        return 0
    return title_score * .6 + artist_score * .3 + (.1 if expected_ms and abs(duration - expected_ms) < 5000 else 0)


def resolve(title, artist, expected_ms):
    """Rank metadata before extracting a complete matching stream."""
    options = {
        "format": "bestaudio[ext=m4a]/best[ext=mp4]/bestaudio/best",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 15,
        "retries": 2,
        # The default Android VR client exposes URLs which currently answer 403.
        # The regular Android client provides a signed MP4 stream without a JS runtime.
        "extractor_args": {"youtube": {"player_client": ["android"]}},
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        with yt_dlp.YoutubeDL({**options, 'extract_flat': True}) as search:
            result = search.extract_info('ytsearch5:' + title + ' ' + artist + ' audio', download=False)
        candidates = sorted((item for item in result.get('entries', []) if item),
                            key=lambda item: score(item, title, artist, expected_ms), reverse=True)
        info = None
        for candidate in candidates:
            if not score(candidate, title, artist, expected_ms):
                continue
            try:
                resolved = downloader.extract_info(candidate.get('url') or 'https://www.youtube.com/watch?v=' + candidate['id'], download=False)
                if resolved and score(resolved, title, artist, expected_ms) and resolved.get('url'):
                    info = resolved
                    break
            except yt_dlp.utils.DownloadError:
                continue
        if not info:
            raise RuntimeError('No se encontró una coincidencia completa de título, artista y duración')
        stream_url = info.get("url") or ""
        return json.dumps({
            "streamUrl": stream_url,
            "title": info.get("title") or "",
            "artist": info.get("artist") or info.get("uploader") or info.get("channel") or "",
            "durationMs": int(float(info.get("duration") or 0) * 1000),
            "id": info.get("id") or "",
            "ext": info.get("ext") or "m4a",
        })
