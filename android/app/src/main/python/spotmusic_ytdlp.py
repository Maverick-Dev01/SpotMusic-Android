import json

import yt_dlp


def resolve(query, output_template):
    """Resolve one search result with the Android client and download it locally."""
    options = {
        "format": "bestaudio[ext=m4a]/best[ext=mp4]/bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 25,
        "retries": 3,
        "fragment_retries": 3,
        # The default Android VR client exposes URLs which currently answer 403.
        # The regular Android client provides a signed MP4 stream without a JS runtime.
        "extractor_args": {"youtube": {"player_client": ["android"]}},
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        result = downloader.extract_info("ytsearch1:" + query, download=True)
        entries = result.get("entries") if isinstance(result, dict) else None
        info = entries[0] if entries else result
        if not info:
            raise RuntimeError("No search result")
        requested = info.get("requested_downloads") or []
        filepath = requested[0].get("filepath") if requested else None
        filepath = filepath or info.get("_filename") or downloader.prepare_filename(info)
        return json.dumps({
            "filepath": filepath,
            "title": info.get("title") or "",
            "artist": info.get("artist") or info.get("uploader") or info.get("channel") or "",
            "durationMs": int(float(info.get("duration") or 0) * 1000),
            "id": info.get("id") or "",
            "ext": info.get("ext") or "",
        })
