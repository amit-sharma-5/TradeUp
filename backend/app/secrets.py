"""Secrets storage: the Dhan credentials come in through the UI and live in
backend/.env (git-ignored, mode 0600) — never in code, never in git, never
returned to any client (only masked previews).

When the Dhan feed is wired (needs the Data API plan), it will read these
same keys; the live WebSocket URL contains the token, so it must never be
logged or shipped to the frontend.
"""
import os
import stat
from pathlib import Path

from .config import REPO_ROOT

_FILE = Path(os.getenv("TRADEUP_ENV_FILE", REPO_ROOT / "backend" / ".env"))
_KEYS = ("DHAN_CLIENT_ID", "DHAN_ACCESS_TOKEN")


def set_dhan(client_id: str, access_token: str) -> dict:
    """Upsert the two Dhan keys into backend/.env (atomic, owner-only perms)."""
    updates = {"DHAN_CLIENT_ID": (client_id or "").strip(),
               "DHAN_ACCESS_TOKEN": (access_token or "").strip()}
    if not updates["DHAN_CLIENT_ID"] or not updates["DHAN_ACCESS_TOKEN"]:
        raise ValueError("both client id and access token are required")
    lines = _FILE.read_text(encoding="utf-8").splitlines() if _FILE.exists() else []
    for k, v in updates.items():
        lines = [l for l in lines if not l.strip().startswith(k + "=")] + [f"{k}={v}"]
    tmp = _FILE.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)        # 0600: only the owner reads it
    tmp.replace(_FILE)
    return status()


def status() -> dict:
    """Masked preview: never the actual values."""
    env = _read_env()
    return {"client_id": _mask(env.get("DHAN_CLIENT_ID")),
            "token": _mask(env.get("DHAN_ACCESS_TOKEN")),
            "configured": bool(env.get("DHAN_CLIENT_ID") and env.get("DHAN_ACCESS_TOKEN"))}


def dhan_credentials() -> dict:
    """For server-side code only (the future Dhan feed) — never serialized to clients."""
    env = _read_env()
    return {"client_id": env.get("DHAN_CLIENT_ID", ""),
            "access_token": env.get("DHAN_ACCESS_TOKEN", "")}


def _read_env() -> dict:
    env = {}
    if _FILE.exists():
        for line in _FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _mask(v: str | None) -> str:
    if not v:
        return ""
    return v[:2] + "…" + v[-2:] if len(v) > 6 else "***"