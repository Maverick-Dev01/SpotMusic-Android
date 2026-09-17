import json

import yt_dlp


def resolve(query, output_template):
    """Resolve one search result with the Android client and return streaming URL without downloading."""
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
        result = downloader.extract_info("ytsearch1:" + query, download=False)
        entries = result.get("entries") if isinstance(result, dict) else None
        info = entries[0] if entries else result
        if not info:
            raise RuntimeError("No search result")
        stream_url = info.get("url") or ""
        return json.dumps({
            "streamUrl": stream_url,
            "title": info.get("title") or "",
            "artist": info.get("artist") or info.get("uploader") or info.get("channel") or "",
            "durationMs": int(float(info.get("duration") or 0) * 1000),
            "id": info.get("id") or "",
            "ext": info.get("ext") or "m4a",
        })
