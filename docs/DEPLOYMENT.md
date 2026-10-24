# Deploying TradeUp beyond localhost — architecture & options

You want the app on a server and usable from your phone, without making it
public. This doc explains how the current design maps to that, what has to
change, and the realistic deployment options from most-private to most-open.

## 1. Current storage model (why it's mostly server-ready already)

Every mutable thing is behind an interface, and all state is local files:

| Concern | Today | Interface | On a server |
|---|---|---|---|
| Journal (trades + events) | `data/journal/trades.csv` + `events.csv` (append-only events, atomic snapshot) | `Store` | CSV works, but **SQLite is the right default** once two clients can write concurrently (`TRADEUP_STORE=sqlite`, same interface, auto-imports the CSV once) |
| Prices | SEPA's `data/prices/*.csv` (one file per symbol) | file store | unchanged — files, one writer (the daily job) |
| Engine cache | SEPA `data/cache/*.pkl` | — | unchanged |
| Settings / watchlist / profiles | `data/settings.json`, `watchlist.json`, `profiles.json` | — | fine for one user; Postgres later for multi-user |
| Secrets (Dhan) | `backend/.env`, mode 0600, masked via UI | `secrets.py` | unchanged — server-side only, never in responses |
| Auth | passphrase + HMAC-signed HttpOnly cookie; **dormant until `TRADEUP_PASSPHRASE` is set** | `auth.py` | **must be enabled** before anything leaves localhost |

Key properties already in place:
- **Append-only event log** — the journal is crash-safe and auditable; SQLite keeps the same semantics (`trade_events` with an autoincrement `seq`).
- **One writer per file** — background jobs (scheduler, quote poller) and the API are threads of one process, so no cross-process locking issues. With multiple users you want one server process (uvicorn workers=1) until the DB swap.
- **The client is dumb** (D5) — a phone browser is just another client of the same JSON API. The PWA manifest already makes it installable.

## 2. Auth — what exists and what's next

`TRADEUP_PASSPHRASE` (env or `backend/.env`) turns on login for every `/api`
route except `/api/health` and `/api/login`: passphrase → HMAC-signed HttpOnly
cookie (SameSite=Strict, 30 days). Frontend shows a login screen on 401.

That is adequate for a single user over HTTPS. Before real multi-user:
- per-user passphrases → user table in Postgres, user id inside the signed cookie;
- rate-limit `/api/login` (fail2ban or slowapi) once exposed;
- keep the cookie `Secure` (automatic once served over HTTPS).

## 3. Private ways to use it from multiple devices

| Option | How | Effort | Notes |
|---|---|---|---|
| **Tailscale (recommended)** | Install Tailscale on the server + phone; app stays bound to localhost; access via the tailnet IP/MagicDNS name | ~30 min, free for personal use | The network *is* the boundary — no public exposure at all, no domain, no certificate juggling. Best fit for a personal, single-user tool. Combine with the passphrase for defence-in-depth. |
| **VPS + HTTPS + auth** | Put the app on a small VPS behind Caddy/nginx with Let's Encrypt; `TRADEUP_PASSPHRASE` required; uvicorn bound to 127.0.0.1 behind the proxy | an evening | `tradeup.ai` becomes reachable only through the login. Add rate limiting on login. Fine once HTTPS + auth are confirmed. |
| **Cloudflare Access / Tunnel** | `cloudflared` tunnel to the app; Cloudflare Access sits in front with SSO (email OTP) | ~1 h | No open ports on the server at all; access controlled by Cloudflare login. Keeps `tradeup.ai` private with zero infra. |
| Plain public `tradeup.ai` without auth | — | — | **Never.** Even with auth-only-at-login it invites bots; and the Dhan token lives server-side, so the blast radius of a mistake is your broker data plan. |

**Recommendation:** Tailscale today (zero exposure, works on the phone via the
installed PWA pointed at the tailnet URL), VPS+HTTPS+auth only when you want to
share with someone or drop the VPN app.

## 4. What changes technically for the server

1. `TRADEUP_PASSPHRASE=...` in backend/.env (auth on), uvicorn **without** `--reload`.
2. `TRADEUP_STORE=sqlite` (concurrent reads from phone + desktop; single process still fine).
3. Run under systemd (`Restart=always`) or `docker compose`; the one-click scripts remain for local use.
4. Set `SEPA_ROOT` to wherever the SEPA repo + price store live on the server, and let the daily job do its Yahoo updates there.
5. HTTPS in front (Caddy makes this one line) unless Tailscale-only.
6. Backups = copy `data/` (journal, settings, profiles, watchlist) — one rsync line.

## 5. Multi-user later (deliberately deferred)

The seams are already in place (`Store`, `Broker`, signal source, auth), but real
multi-user means: user accounts in Postgres, per-user journals/watchlists/settings,
the screener shared (one price store) while trades are per-user, and re-checking
data licensing (Dhan is per-account; StockEdge exports are personal). Decisions to
make then: Postgres schema + migration from SQLite, and whether each user brings
their own Dhan credentials (they must).

## 6. Secrets rules (unchanged, non-negotiable)

- Dhan client id + access token: stored only in `backend/.env` on the server, mode 0600, entered via the Settings dialog (masked display), never logged, never in URLs, never shipped to clients.
- `TRADEUP_PASSPHRASE`: same file.
- No third party ever receives credentials; the Dhan WebSocket URL contains the token, so the feed adapter must never log URLs.
