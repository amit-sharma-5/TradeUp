import { useEffect, useState } from "react";
import {
  Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, IconButton,
  Stack, Tooltip, Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api, Health, Holding, Signal, Watchlists } from "../api";
import { Empty, ErrorNote, fmt, fmtPct, Loading, PageHeader, SectionTitle, tone } from "../ui";

const GROUPS = [
  { key: "Strong Buy", label: "Strong Buy", color: "success.main", chip: "success" as const,
    hint: "Early-base breakouts with volume, RS ≥ 90 and strong earnings — or their pullback re-entry" },
  { key: "Buy", label: "Buy", color: "info.main", chip: "info" as const,
    hint: "Other volume breakouts inside the buy zone" },
  { key: "Watch", label: "Algo Watch", color: "secondary.main", chip: "secondary" as const,
    hint: "Stage-2 uptrends at a decision point: buy-ready bases, extended or resting breakouts" },
];

/** Home: what needs attention today, in priority order. */
export default function TodayPage({ tick, onStock, onTrade, onRefreshed }: {
  tick: number; onStock: (s: string) => void; onTrade: (s: Signal) => void; onRefreshed: () => void;
}) {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [market, setMarket] = useState<Watchlists["Market"]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.candidates().then((s) => { setSignals(s); setErr(""); }).catch((e) => setErr(String(e.message || e)));
    api.health().then(setHealth).catch(() => {});
    api.holdings().then((h) => setHoldings(h.holdings)).catch(() => {});
  }, [tick]);
  useEffect(() => {
    api.watchlists().then((w) => setMarket(w.Market ?? [])).catch(() => {});
  }, [tick, health?.signals?.asof]);

  const rescan = async () => {
    setRefreshing(true);
    try { await api.refreshSignals(); } catch { /* shown via health */ }
    setTimeout(() => { setRefreshing(false); onRefreshed(); }, 5000);
  };

  const scanning = refreshing || !!health?.signals?.refreshing;
  const mock = health?.signal_source === "mock";
  const m = Object.fromEntries((market ?? []).map((x) => [x.measure, x.value]));
  const needsAction = holdings.filter((h) => h.action.includes("Sell") || h.action.includes("Add") || h.action.includes("Partial"));

  return (
    <Box>
      <PageHeader
        title="Today"
        subtitle={mock ? "Mock signals — the SEPA engine was not found"
          : health?.signals?.asof ? `Scan as of ${health.signals.asof}` : "Waiting for the first scan…"}
        actions={
          <Tooltip title="Re-run the scan now">
            <span><IconButton onClick={rescan} disabled={scanning || mock} aria-label="re-run scan">
              {scanning ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton></span>
          </Tooltip>
        }
      />

      {/* market pulse */}
      {Object.keys(m).length > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary">Nifty 500</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{fmt(m["Nifty 500"] as number, 0)}</Typography>
              </Box>
              <Pulse label="vs 50-day" v={m["vs 50-DMA %"] as number} />
              <Pulse label="vs 200-day" v={m["vs 200-DMA %"] as number} />
              <Pulse label="Stocks above 50-day" v={m["% above 50-DMA"] as number} pct />
              <Pulse label="Passing Trend Template" v={m["% passing Trend Template"] as number} pct />
            </Stack>
            {(m["% above 50-DMA"] as number) < 30 && (
              <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.75 }}>
                Weak breadth: most stocks are below their 50-day. Breakouts fail more often in markets like this — size down or wait.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {err && <ErrorNote error={err} />}

      {/* holdings that need attention */}
      {needsAction.length > 0 && <>
        <SectionTitle>Your positions need attention</SectionTitle>
        <Stack spacing={1}>
          {needsAction.map((h) => (
            <Card key={h.id} variant="outlined" sx={{ borderLeft: 4, borderLeftColor: h.action.includes("Sell") ? "error.main" : "success.main" }}>
              <CardActionArea onClick={() => onStock(h.symbol)}>
                <CardContent sx={{ py: 1.2, "&:last-child": { pb: 1.2 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography sx={{ fontWeight: 800 }}>{h.symbol}</Typography>
                    <Chip size="small" label={h.action} sx={{ height: 22 }} />
                    <Box flexGrow={1} />
                    <Typography sx={{ fontWeight: 700, color: tone(h.ret_pct) }}>{fmtPct(h.ret_pct)}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{h.why}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      </>}

      {/* action lists */}
      {!signals && !err && <Loading label="Loading the screener…" />}
      {signals && GROUPS.map((g) => {
        const rows = signals.filter((s) => s.category === g.key);
        return (
          <Box key={g.key}>
            <SectionTitle right={<Typography variant="caption" color="text.secondary">{rows.length}</Typography>}>
              <Box component="span" sx={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", bgcolor: g.color, mr: 1 }} />
              <Tooltip title={g.hint}><span>{g.label}</span></Tooltip>
            </SectionTitle>
            {rows.length === 0 ? (
              <Empty>No {g.label} stocks today{g.key === "Strong Buy" ? " — doing nothing is a valid decision." : "."}</Empty>
            ) : (
              <Stack spacing={1.25}>
                {rows.map((s) => <SignalCard key={s.symbol} s={s} color={g.color} chip={g.chip}
                                            onOpen={() => onStock(s.symbol)} onTrade={() => onTrade(s)} />)}
              </Stack>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function Pulse({ label, v, pct }: { label: string; v: number | undefined; pct?: boolean }) {
  if (v == null) return null;
  const color = pct ? (v >= 50 ? "success.main" : v < 30 ? "error.main" : "text.primary") : tone(v);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, color }}>
        {pct ? `${fmt(v, 0)}%` : fmtPct(v)}
      </Typography>
    </Box>
  );
}

function SignalCard({ s, color, chip, onOpen, onTrade }: {
  s: Signal; color: string; chip: "success" | "info" | "secondary"; onOpen: () => void; onTrade: () => void;
}) {
  const facts = [
    s.watch_type,
    s.grade,
    s.entry,
    s["above_pivot%"] != null ? `${fmtPct(s["above_pivot%"])} vs pivot` : null,
    s["to_pivot%"] != null ? `${fmt(s["to_pivot%"], 1)}% to pivot` : null,
    s.vol_x != null ? `vol ${fmt(s.vol_x, 1)}×` : null,
    s.base_no != null ? `base ${Math.round(s.base_no)}` : null,
  ].filter(Boolean) as string[];

  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: color }}>
      <CardActionArea onClick={onOpen}>
        <CardContent sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>{s.symbol}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{s.name}</Typography>
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                ₹{fmt(s.ltp)}
              </Typography>
              <Typography variant="caption" sx={{ color: tone(s.change_pct), fontWeight: 700 }}>{fmtPct(s.change_pct, 2)}</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {s.rs != null && <Chip size="small" color={s.rs >= 90 ? "success" : s.rs >= 70 ? "info" : "default"}
                                   variant="outlined" label={`RS ${Math.round(s.rs)}`} sx={{ height: 22 }} />}
            {facts.map((f) => <Chip key={f} size="small" variant="outlined" label={f} sx={{ height: 22 }} />)}
          </Stack>
          <Typography variant="body2" sx={{ mt: 1 }}>{s.why}</Typography>
        </CardContent>
      </CardActionArea>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pb: 1.25 }}>
        <Chip size="small" color={chip} label={`Buy point ₹${fmt(s.pivot)}`} sx={{ height: 24 }} />
        <Chip size="small" variant="outlined" color="error" label={`Stop ₹${fmt(s.stop)}`} sx={{ height: 24 }} />
        <Box flexGrow={1} />
        <Button size="small" variant="contained" onClick={onTrade}>Paper trade</Button>
      </Stack>
    </Card>
  );
}