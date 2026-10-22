"""App configuration: paths from the environment, never hard-coded.

- TRADEUP_DATA_DIR  — where the journal lives (default: <repo>/data)
- SEPA_ROOT         — the sibling repo whose sepa package we import as a library
                      and whose price store we reuse (default: ../SEPA-terminal)
Secrets (a future Dhan token) come from backend/.env only — never in code or git.
"""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = Path(os.getenv("TRADEUP_DATA_DIR", REPO_ROOT / "data"))
JOURNAL_DIR = DATA_DIR / "journal"

SEPA_ROOT = Path(os.getenv("SEPA_ROOT", REPO_ROOT.parent / "SEPA-terminal"))