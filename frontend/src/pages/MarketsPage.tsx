import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete, Box, Chip, IconButton, Stack, Tab, Tabs, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, SectorRow, StockSymbol, WatchlistRow, Watchlists, WatchRow } from "../api";
import { Col, DataTable, Empty, ErrorNote, fmt, fmtPct, Loading, PageHeader, RsChip, StageChip, tone } from "../ui";

const TABS = [
  { key: "sectors", label: "Sectors", hint: "Industries of the NIFTY 500: performance and how many stocks are in healthy uptrends." },
  { key: "Leaders", label: "Leaders", hint: "RS ≥ 90 with the RS line at a new high — the strongest stocks." },
  { key: "Uptrend (no base)", label: "Uptrend", hint: "Stage-2 uptrends without a base yet — wait for a setup." },
  { key: "Sell-Avoid", label: "Sell / Avoid", hint: "Climax runs, big down days or Stage 3/4 in former leaders." },
  { key: "Earnings x Tech", label: "Earnings × Tech", hint: "Stocks in your StockEdge data with their technical status." },
  { key: "mine", label: "My Watch", hint: "Your personal list — stocks you are studying. Live prices." },
] as const;

export default function MarketsPage({ tick, onStock }: { tick: number; onStock: (s: string) => void }) {
  const [tab, setTab] = useState(0);
  const [wl, setWl] = useState<Watchlists | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api.watchlists().then(setWl).catch((e) => setErr(String(e.message || e))); }, [tick]);

  const t = TABS[tab];
  const count = (k: string) => ((wl as unknown as Record<string, WatchlistRow[]>)?.[k] ?? []).length;

  return (
    <Box>
      <PageHeader title="Markets" subtitle={t.hint} />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
            sx={{ mb: 2, minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 700 } }}>
        {TABS.map((x) => (
          <Tab key={x.key} label={x.key === "sectors" || x.key === "mine" || !wl ? x.label : `${x.label} · ${count(x.key)}`} />
        ))}
      </Tabs>
      {err && <ErrorNote error={err} />}
      {t.key === "sectors" && <Sectors tick={tick} onStock={onStock} />}
      {t.key === "mine" && <MyWatch tick={tick} onStock={onStock} />}
      {t.key !== "sectors" && t.key !== "mine" && (
        !wl ? <Loading /> : <ListTable kind={t.key} rows={(wl as unknown as Record<string, WatchlistRow[]>)[t.key] ?? []} onStock={onStock} />
      )}
    </Box>
  );
}

/* ── engine lists ─────────────────────────────────────────────────────── */

function ListTable({ kind, rows, onStock }: { kind: string; rows: WatchlistRow[]; onStock: (s: string) => void }) {
  if (!rows.length) {
    return <Empty>{kind === "Earnings x Tech"
      ? "No StockEdge data on file — import the quarter's export from the ⋮ menu."
      : "Nothing in this list today."}</Empty>;
  }
  const cols: Col<WatchlistRow>[] = [
    { key: "s", label: "Stock", render: (r) => <b>{r.symbol}</b> },
    { key: "c", label: "Close", render: (r) => `₹${fmt(r.close as number)}` },
    { key: "rs", label: "RS", render: (r) => <RsChip rs={r.rs as number} /> },
    { key: "st", label: "Stage", hide: kind === "Earnings x Tech", render: (r) => <StageChip stage={r.stage as number} /> },
    { key: "tt", label: "TT", align: "center", hide: kind !== "Earnings x Tech", render: (r) => (r.tt ? "✓" : "✗") },
    { key: "x", label: kind === "Sell-Avoid" ? "Signal" : kind === "Uptrend (no base)" ? "Breakout cycle" : "Setup",
      align: "left",
      render: (r) => <Typography variant="body2" sx={{ color: kind === "Sell-Avoid" ? "error.main" : "text.secondary" }}>
        {(r.signal ?? r.cycle ?? r.setup ?? r.note ?? "—") as string}
      </Typography> },
  ];
  return <DataTable cols={cols} rows={rows} rowKey={(r) => r.symbol} onRowClick={(r) => onStock(r.symbol)} />;
}

/* ── sectors ───────────────────────────────────────────────────────────── */

const PERIODS = ["1D", "1W", "1M", "3M", "1Y", "5Y"] as const;

function Sectors({ tick, onStock }: { tick: number; onStock: (s: string) => void }) {
  const [rows, setRows] = useState<SectorRow[] | null>(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("1M");
  const [sortBy, setSortBy] = useState<"perf" | "breadth">("perf");
  const [open, setOpen] = useState<SectorRow | null>(null);

  useEffect(() => { api.sectors().then((d) => setRows(d.sectors)).catch((e) => setErr(String(e.message || e))); }, [tick]);

  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) =>
    sortBy === "perf" ? (b[period] ?? -1e9) - (a[period] ?? -1e9) : b["stage2%"] - a["stage2%"]), [rows, period, sortBy]);

  if (err) return <ErrorNote error={err} />;
  if (!rows) return <Loading label="Grouping the NIFTY 500 by industry…" />;
  if (!rows.length) return <Empty>No sector data yet — the first scan fills this in.</Empty>;

  if (open) {
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <IconButton onClick={() => setOpen(null)} aria-label="back to sectors" edge="start"><ArrowBackIcon /></IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{open.industry}</Typography>
            <Typography variant="caption" color="text.secondary">
              {open.stocks} stocks · {fmt(open["stage2%"], 0)}% in Stage 2 · {fmt(open["above50%"], 0)}% above 50-day
            </Typography>
          </Box>
        </Stack>
        <DataTable rows={open.members} rowKey={(m) => m.symbol} onRowClick={(m) => onStock(m.symbol)} cols={[
          { key: "s", label: "Stock", render: (m) => <b>{m.symbol}</b> },
          { key: "c", label: "Close", render: (m) => `₹${fmt(m.close)}` },
          { key: "d", label: "1D", render: (m) => <Box component="span" sx={{ color: tone(m["1D"]) }}>{fmtPct(m["1D"])}</Box> },
          { key: "m", label: "1M", render: (m) => <Box component="span" sx={{ color: tone(m["1M"]) }}>{fmtPct(m["1M"])}</Box> },
          { key: "rs", label: "RS", render: (m) => <RsChip rs={m.rs} /> },
          { key: "st", label: "Stage", render: (m) => <StageChip stage={m.stage} /> },
          { key: "su", label: "Setup", align: "left", render: (m) => m.setup || "—" },
        ]} />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)}>
          {PERIODS.map((p) => <ToggleButton key={p} value={p} sx={{ px: 1.2, py: 0.3 }}>{p}</ToggleButton>)}
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={sortBy} onChange={(_, v) => v && setSortBy(v)}>
          <ToggleButton value="perf" sx={{ px: 1.2, py: 0.3, textTransform: "none" }}>Sort: return</ToggleButton>
          <ToggleButton value="breadth" sx={{ px: 1.2, py: 0.3, textTransform: "none" }}>Sort: health</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Stack spacing={0.75}>
        {sorted.map((r) => <SectorBar key={r.industry} r={r} period={period} onOpen={() => setOpen(r)} />)}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Return = median of the industry's stocks. Bar = share of its stocks in a Stage-2 uptrend. Tap an industry for its stocks.
      </Typography>
    </Box>
  );
}

/** One industry as a compact card row — readable on a phone, unlike a 11-column table. */
function SectorBar({ r, period, onOpen }: { r: SectorRow; period: string; onOpen: () => void }) {
  const ret = r[period as keyof SectorRow] as number | null | undefined;
  const s2 = r["stage2%"];
  return (
    <Box onClick={onOpen} role="button"
         sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 2.5, bgcolor: "background.paper",
               cursor: "pointer", "&:hover": { borderColor: "primary.main" } }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap>{r.industry}</Typography>
        <Typography variant="caption" color="text.secondary">{r.stocks}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 64, textAlign: "right", color: tone(ret, 0.5) }}>
          {fmtPct(ret)}
        </Typography>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
        <Box sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: "grey.200", overflow: "hidden" }}>
          <Box sx={{ width: `${Math.min(100, s2)}%`, height: "100%",
                     bgcolor: s2 >= 40 ? "success.main" : s2 >= 20 ? "secondary.main" : "error.light" }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 168, textAlign: "right" }}>
          Stage 2 {fmt(s2, 0)}% · TT {fmt(r["tt%"], 0)}% · &gt;50d {fmt(r["above50%"], 0)}%
        </Typography>
      </Stack>
    </Box>
  );
}

/* ── my watchlist ─────────────────────────────────────────────────────── */

function MyWatch({ tick, onStock }: { tick: number; onStock: (s: string) => void }) {
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [all, setAll] = useState<StockSymbol[]>([]);
  const [err, setErr] = useState("");

  const load = () => api.watchlist().then((d) => setRows(d.symbols)).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, [tick]);                // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.symbols().then(setAll).catch(() => {}); }, []);

  const add = (s: StockSymbol | null) => {
    if (!s) return;
    setErr("");
    api.addWatch(s.symbol).then(load).catch((e) => setErr(String(e.message || e)));
  };

  return (
    <Box>
      <Autocomplete
        size="small" options={all} value={null} blurOnSelect onChange={(_, v) => add(v)}
        getOptionLabel={(s) => `${s.symbol} — ${s.name}`}
        filterOptions={(o, { inputValue }) => {
          const q = inputValue.trim().toLowerCase();
          return q ? o.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 20) : [];
        }}
        renderInput={(p) => <TextField {...p} placeholder="Add a stock to watch — symbol or company" />}
        sx={{ mb: 1.5 }}
      />
      {err && <ErrorNote error={err} />}
      {!rows ? <Loading /> : rows.length === 0 ? (
        <Empty>Your personal list is empty. Add stocks you are studying — they get live prices, separate from the engine's lists.</Empty>
      ) : (
        <DataTable rows={rows} rowKey={(r) => r.symbol} onRowClick={(r) => onStock(r.symbol)} cols={[
          { key: "s", label: "Stock", render: (r) => <Box><b>{r.symbol}</b>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>{r.name}</Typography></Box> },
          { key: "l", label: "Price", render: (r) => `₹${fmt(r.ltp)}` },
          { key: "c", label: "Change", render: (r) => <Chip size="small" variant="outlined"
              color={(r.change_pct ?? 0) >= 0 ? "success" : "error"} label={fmtPct(r.change_pct, 2)} sx={{ height: 22 }} /> },
          { key: "x", label: "", align: "right", width: 44, render: (r) => (
              <IconButton size="small" aria-label={`remove ${r.symbol}`}
                          onClick={(e) => { e.stopPropagation(); api.removeWatch(r.symbol).then(load); }}>
                <CloseIcon fontSize="small" />
              </IconButton>) },
        ]} />
      )}
    </Box>
  );
}