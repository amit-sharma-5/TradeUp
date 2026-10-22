"""Dhan price feed — stub only (Phase 1).

Yahoo (via the SEPA downloader) covers EOD signals. A Dhan adapter arrives when
the owner's token is available; its token must live in backend/.env, never in
code or git, and never appear in logs or API responses (ARCHITECTURE.md §7).
"""


class DhanFeed:
    name, live = "dhan", False

    def update(self, symbols: list[str]):
        raise NotImplementedError(
            "Dhan feed is not built yet (Phase 1 uses Yahoo). Wire it in feed/dhan.py "
            "when a Dhan access token is available, keeping the token server-side only.")