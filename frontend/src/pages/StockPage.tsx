import { useEffect, useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, IconButton, Stack, Tooltip, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { api, NewsItem, Signal, StockDetail } from "../api";
import StockChart from "../components/StockChart";
import { Empty, ErrorNote, fmt, fmtPct, Loading, money, RsChip, SectionTitle, StageChip, Stat, tone } from "../ui";

/** Everything about one stock, in the order a trader decides:
 *  status → chart → rule checklist → plan → history → fundamentals → news → my trades. */
export default function StockPage({ symbol, onBack, onTrade, tick }: {
  symbol: string; onBack: () => void; onTrade: (s: Signal) => void; tick: number;
}) {
  const [d, setD] = useState<StockDetail | null>(null);
  const [err, setErr] = useState("");
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    setErr("");
    api.stock(symbol).then(setD).catch((e) => setErr(String(e.message || e)));
  }, [symbol, tick]);
  useEffect(() => {
    setNews(null);
    api.news(symbol).then((n) => setNews(Array.isArray(n) ? n : [])).catch(() => setNews([]));
    api.watchlist().then((w) => setWatched(w.symbols.some((s) => s.symbol === symbol))).catch(() => {});
  }, [symbol]);

  const toggleWatch = () =>
    (watched ? api.removeWatch(symbol) : api.addWatch(symbol)).then(() => setWatched(!watched)).catch(() => {});

  const trade = () => {
    if (!d?.status.close) return;
    const pivot = d.status.pivot ?? d.status.close;
    onTrade({
      symbol, name: symbol, category: d.status.lists[0] ?? "Watch", ltp: d.status.close, change_pct: 0,
      pivot, stop: d.plan?.stop ?? Math.round(pivot * 0.93 * 100) / 100,
      why: d.status.lists.length ? `Listed today in ${d.status.lists.join(", ")}` : "Manual paper trade (not in today's lists)",
      rs: d.status.rs ?? undefined,
    });
  };

  const s = d?.status;
  const passed = d?.checklist.filter((c) => c.ok).length ?? 0;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={onBack} aria-label="back" edge="start"><ArrowBackIcon /></IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>{symbol}</Typography>
          {s && <Typography variant="body2" color="text.secondary">
            ₹{fmt(s.close)}{s.setup ? ` · ${s.setup}` : ""}{s.pivot ? ` · pivot ₹${fmt(s.pivot)}` : ""}
          </Typography>}
        </Box>
        <Tooltip title={watched ? "Remove from My Watch" : "Add to My Watch"}>
          <IconButton onClick={toggleWatch} aria-label="watch">{watched ? <StarIcon color="secondary" /> : <StarBorderIcon />}</IconButton>
        </Tooltip>
        <Button variant="contained" size="small" onClick={trade} disabled={!s?.close}>Trade</Button>
      </Stack>

      {err && <ErrorNote error={err} />}
      {!d && !err && <Loading label="Reading the engine's view of this stock…" />}

      {d && s && <>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <StageChip stage={s.stage} />
          <Chip size="small" color={s.tt ? "success" : "default"} variant={s.tt ? "filled" : "outlined"}
                label={s.tt ? "Trend Template ✓" : "Trend Template ✗"} sx={{ height: 22 }} />
          <RsChip rs={s.rs} />
          {s.rs_line_new_high && <Chip size="small" color="info" label="RS line at new high" sx={{ height: 22 }} />}
          {s.lists.map((l) => <Chip key={l} size="small" variant="outlined" color="secondary" label={l} sx={{ height: 22 }} />)}
        </Stack>

        <StockChart symbol={symbol} />

        <SectionTitle right={<Typography variant="caption" color="text.secondary">{passed}/{d.checklist.length} met</Typography>}>
          Trend Template checklist
        </SectionTitle>
        <Card variant="outlined"><CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
          {d.checklist.map((c) => (
            <Stack key={c.rule} direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.6 }}>
              {c.ok ? <CheckCircleIcon color="success" fontSize="small" sx={{ mt: 0.1 }} />
                    : <CancelIcon color="error" fontSize="small" sx={{ mt: 0.1 }} />}
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: c.ok ? 400 : 700 }}>{c.rule}</Typography>
                <Typography variant="caption" color="text.secondary">{c.detail}</Typography>
              </Box>
            </Stack>
          ))}
        </CardContent></Card>

        <SectionTitle>Key numbers</SectionTitle>
        <Card variant="outlined"><CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
            <Stat label="Off 52-wk high" value={fmtPct(s.off_high_pct == null ? null : -s.off_high_pct)} />
            <Stat label="Above 50-day" value={fmtPct(s.ext50_pct)} />
            <Stat label="Volume vs avg" value={s.vol_x == null ? "—" : `${fmt(s.vol_x, 1)}×`} />
            <Stat label="Turnover" value={s.turnover_cr == null ? "—" : `₹${fmt(s.turnover_cr, 0)} cr`} />
            <Stat label="Stage-2 bases" value={s.base_count_stage2 ?? "—"} />
          </Stack>
        </CardContent></Card>

        {d.plan && <>
          <SectionTitle>Trade plan (your sizing)</SectionTitle>
          <Card variant="outlined"><CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
              <Stat label="Buy at (pivot)" value={`₹${fmt(d.plan.entry)}`} />
              <Stat label="Stop" value={`₹${fmt(d.plan.stop)}`} color="error.main" hint={`${fmt(d.plan.stop_pct, 1)}% below entry`} />
              <Stat label="Shares" value={d.plan.qty} />
              <Stat label="Position" value={money(d.plan.value)} hint={`${fmt(d.plan.pos_pct_eq, 1)}% of equity`} />
              <Stat label="Risk" value={money(d.plan.risk_rs)} hint={`${fmt(d.plan.risk_pct_eq)}% of equity`} />
              <Stat label="+2R / +3R" value={`₹${fmt(d.plan.r2, 0)} / ₹${fmt(d.plan.r3, 0)}`} color="success.main" />
            </Stack>
            {d.plan.problems.length > 0 && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>⚠ {d.plan.problems.join(" · ")}</Typography>
            )}
            {d.plan.capped && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Capped by your max-position setting.
              </Typography>
            )}
          </CardContent></Card>
        </>}

        <SectionTitle>Breakouts & violations</SectionTitle>
        {d.breakouts.length === 0 ? <Empty>No breakouts recorded for this stock.</Empty> : (
          <Stack spacing={0.75}>
            {d.breakouts.map((b) => (
              <Card key={b.date + b.type} variant="outlined"><CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{b.date}</Typography>
                  <Chip size="small" variant="outlined" label={b.type} sx={{ height: 22 }} />
                  {b.base_no != null && <Typography variant="caption" color="text.secondary">base {b.base_no}</Typography>}
                  <Typography variant="caption" color="text.secondary">pivot ₹{fmt(b.pivot)}</Typography>
                  {b.vol_x != null && <Typography variant="caption" color="text.secondary">vol {fmt(b.vol_x, 1)}×</Typography>}
                  <Box flexGrow={1} />
                  <Typography variant="body2" sx={{ color: tone(b.since_pct), fontWeight: 700 }}>{fmtPct(b.since_pct)} since</Typography>
                </Stack>
                {b.violations.length > 0 && (
                  <Typography variant="caption" color="error.main">Violations: {b.violations.join(", ")}</Typography>
                )}
              </CardContent></Card>
            ))}
          </Stack>
        )}

        <SectionTitle>Fundamentals (StockEdge)</SectionTitle>
        {Object.keys(d.fundamentals).length === 0 ? (
          <Empty>Not in the StockEdge data on file. Import the quarter's export from the ⋮ menu.</Empty>
        ) : (
          <Card variant="outlined"><CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
              {Object.entries(d.fundamentals).map(([k, v]) => (
                <Stat key={k} label={k.replace(/_/g, " ")}
                      value={typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? fmt(v, 1) : String(v)} />
              ))}
            </Stack>
          </CardContent></Card>
        )}

        <SectionTitle>News (reputable newsrooms, last 30 days)</SectionTitle>
        {news == null ? <Loading /> : news.length === 0 ? <Empty>No recent headlines naming the company.</Empty> : (
          <Stack spacing={0.75}>
            {news.slice(0, 8).map((n) => (
              <Box key={n.link} component="a" href={n.link} target="_blank" rel="noreferrer"
                   sx={{ display: "block", textDecoration: "none", color: "inherit", p: 1.2, border: 1,
                         borderColor: "divider", borderRadius: 2, bgcolor: "background.paper",
                         "&:hover": { borderColor: "primary.main" } }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{n.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {n.source} · {n.date.slice(0, 10)}{n.tags ? ` · ${n.tags}` : ""}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}

        <SectionTitle>My trades in {symbol}</SectionTitle>
        {d.my_trades.length === 0 ? <Empty>No paper trades in this stock yet.</Empty> : (
          <Stack spacing={0.75}>
            {d.my_trades.map((t) => (
              <Card key={t.id} variant="outlined"><CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={t.status} sx={{ height: 22 }} />
                  <Typography variant="body2">{t.qty} sh · entry ₹{fmt(t.entry_price ?? t.trigger)} · stop ₹{fmt(t.stop)}</Typography>
                  {t.exit_price != null && <Typography variant="body2">· exit ₹{fmt(t.exit_price)}</Typography>}
                </Stack>
                {t.note && <Typography variant="caption" color="text.secondary">📝 {t.note}</Typography>}
              </CardContent></Card>
            ))}
          </Stack>
        )}
      </>}
    </Box>
  );
}