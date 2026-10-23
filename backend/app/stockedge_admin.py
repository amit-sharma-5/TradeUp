"""StockEdge exports: status + upload.

The engine (sepa/stockedge.py) reads whatever exports sit in the SEPA data
folder — the app just puts files there safely and triggers a rescan, turning
the quarterly manual chore into drag-and-drop.
"""
import os
import time
from pathlib import Path

from . import config


def _folder() -> Path:
    root = config.SEPA_ROOT
    folder = root / "data" / "stockedge"
    folder.mkdir(parents=True, exist_ok=True)   # same path sepa.stockedge.FOLDER resolves to
    return folder


def status() -> dict:
    """Files present + what the engine's parser makes of the latest one."""
    from sepa import stockedge as se            # caller ensured SEPA is on sys.path
    files = [{"name": p.name, "size_kb": round(p.stat().st_size / 1024),
              "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(p.stat().st_mtime))}
             for p in se.export_files()]
    latest = se.export_files()[-1] if se.export_files() else None
    parsed = {}
    if latest is not None:
        try:
            df = se.read(latest)
            parsed = {"file": latest.name, "rows": len(df),
                      "symbols": df["symbol"].nunique() if "symbol" in df else None,
                      "se_date": str(df["se_date"].max()) if "se_date" in df and len(df) else None}
        except Exception as e:
            parsed = {"file": latest.name, "error": str(e)}
    return {"files": files, "latest": parsed}


def save_upload(filename: str, content: bytes) -> str:
    """Persist an export into the engine's stockedge folder, safely.

    Rejects anything that is not a plain .xlsx/.xls/.csv filename (no paths,
    no double extensions) — mirrors sepa.stockedge._safe's paranoia.
    """
    name = os.path.basename(filename or "").strip()
    if not name or "/" in filename or "\\" in filename or name.startswith("."):
        raise ValueError("invalid filename")
    if name != os.path.basename(name.replace("\\", "/")) or ".." in name:
        raise ValueError("invalid filename")
    if name.lower().split(".")[-1] not in ("xlsx", "xls", "csv") or name.lower().count(".") != 1:
        raise ValueError(f"not a StockEdge export: {name}")
    if len(content) == 0 or len(content) > 25 * 1024 * 1024:
        raise ValueError("file must be between 1 byte and 25 MB")
    target = _folder() / name
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_bytes(content)
    tmp.replace(target)                       # atomic, like every other write here
    return name