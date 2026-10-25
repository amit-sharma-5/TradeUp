"""App configuration: paths from the environment, never hard-coded.

- TRADEUP_DATA_DIR  — where the journal lives (default: <repo>/data)
- SEPA_ROOT         — the sibling repo whose sepa package we import as a library
                      and whose price store we reuse (default: ../SEPA-terminal)
Secrets (a future Dhan token) come from backend/.env only — never in code or git.
"""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path):
    """Load KEY=VALUE lines from backend/.env into the environment once, without
    overriding real environment variables. Everything else (auth, Telegram,
    scan times) reads os.environ, so this must run before those modules import."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv(Path(os.getenv("TRADEUP_ENV_FILE", REPO_ROOT / "backend" / ".env")))

DATA_DIR = Path(os.getenv("TRADEUP_DATA_DIR", REPO_ROOT / "data"))
JOURNAL_DIR = DATA_DIR / "journal"

SEPA_ROOT = Path(os.getenv("SEPA_ROOT", REPO_ROOT.parent / "SEPA-terminal"))

# Journal storage: "csv" (Phase 1 default) or "sqlite" (Phase 2, TRADEUP_STORE=sqlite)
STORE_KIND = os.getenv("TRADEUP_STORE", "csv")