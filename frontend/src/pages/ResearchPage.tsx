import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { createChart, AreaSeries, ColorType } from "lightweight-charts";
import { api, BacktestResult, BacktestRun, RuleProfile } from "../api";
import { Col, DataTable, Empty, ErrorNote, fmt, fmtPct, Loading, PageHeader, SectionTitle, Stat, StatStrip, tone } from "../ui";

/** Research: replay the rules on history (any rule profile), compare saved
 *  runs side by side, and manage the rule profiles themselves. */
export default function ResearchPage({ onStock }: { onStock: (s: string) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <PageHeader title="Research"
                  subtitle="Would these rules have made money, and how bumpy was the ride? Test rule versions before trusting them." />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, "& .MuiTab-root": { textTransform: "none", fontWeight: 700 } }}>
        <Tab label="Backtest" /><Tab label="Compare runs" /><Tab label="Rule profiles" />
      </Tabs>
      {tab === 0 && <Backtest onStock={onStock} />}
      {tab === 1 && <Runs onOpen={() => setTab(0)} />}
      {tab === 2 && <Profiles />}
    </Box>
  );
}

/* ── backtest ──────────────────────────────────────────────────────────── */

function Backtest({ onStock }: { onStock: (s: string) => void }) {
  const [profiles, setProfiles] = useState<RuleProfile[]>([]);
  const [profile, setProfile] = useState("default");
  const [start, setStart] = useState("2012-01-01");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    api.backtestStatus().then((s) => {
      setRunning(s.running); setStatus(s.status);
      if (s.result) setResult(s.result);
      if (!s.running && poll.current) { clearInterval(poll.current); poll.current = null; }
    }).catch((e) => setErr(String(e.message || e)));
  }, []);

  useEffect(() => {
    refresh();
    api.profiles().then((p) => { setProfiles(p.profiles); setProfile(p.active); }).catch(() => {});
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [refresh]);

  const run = async () => {
    setErr("");
    try {
      await api.runBacktest({ start, profile });
      setRunning(true);
      if (!poll.current) poll.current = setInterval(refresh, 2500);
    } catch (e) { setErr(String((e as Error).message || e)); }
  };

  const sepa = result?.summary[0];
  const base = result?.summary[1];
  const pf = result?.portfolio;

  return (
    <Box>
      <Card variant="outlined"><CardContent>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField select size="small" label="Rule profile" value={profile} onChange={(e) => setProfile(e.target.value)} sx={{ minWidth: 160 }}>
            {profiles.map((p) => <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="From" value={start} onChange={(e) => setStart(e.target.value)}
                     InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={run} disabled={running}>
            {running ? "Running…" : "Run backtest"}
          </Button>
          {result?.trades?.length ? (
            <Button size="small" startIcon={<DownloadIcon />} href={api.backtestCsvUrl} download>Trades CSV</Button>
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {running ? "Crunching years of trades — seconds when warm, a minute or two the first time."
                   : status || "Runs are saved automatically so you can compare rule versions."}
        </Typography>
      </CardContent></Card>

      {err && <ErrorNote error={err} />}
      {running && !result && <Loading />}

      {result && sepa && pf && <>
        <SectionTitle right={<Typography variant="caption" color="text.secondary">
          {result.label ?? result.profile ?? "default"} · data to {result.asof}
        </Typography>}>Portfolio result</SectionTitle>
        <StatStrip>
          <Stat label="CAGR" value={fmtPct(pf["CAGR%"])} color="success.main" />
          <Stat label="Max drawdown" value={fmtPct(pf["max DD%"])} color="error.main" />
          <Stat label="Nifty 500 CAGR" value={fmtPct(pf["Nifty 500 CAGR%"])} />
          <Stat label="Nifty 500 max DD" value={fmtPct(pf["Nifty 500 max DD%"])} />
          <Stat label="Years" value={fmt(pf.years, 1)} />
          <Stat label="Avg invested" value={pf["avg invested%"] == null ? "—" : `${fmt(pf["avg invested%"], 0)}%`} />
        </StatStrip>
        <Box sx={{ mt: 1 }}><Curve result={result} /></Box>
        <Typography variant="caption" color="text.secondary">
          {result.params.max_pos} positions max · stop {result.params.stop_pct}% · chase {result.params.chase_pct}%
          {result.params.min_grade ? ` · grade ≥ ${result.params.min_grade}` : ""} · {result.stocks} stocks · {result.breakouts} breakouts since {result.start}
        </Typography>

        <SectionTitle>Per-trade statistics</SectionTitle>
        <DataTable rowKey={(r) => r.set} rows={[sepa, base].filter(Boolean) as typeof sepa[]} cols={[
          { key: "set", label: "Rule set", render: (r) => <b>{r.set.split(" (")[0]}</b> },
          { key: "n", label: "Trades", render: (r) => r.trades },
          { key: "w", label: "Win %", render: (r) => `${fmt(r["win%"], 1)}%` },
          { key: "g", label: "Avg gain", render: (r) => <Box component="span" sx={{ color: "success.main" }}>{fmtPct(r["avg gain%"])}</Box> },
          { key: "l", label: "Avg loss", render: (r) => <Box component="span" sx={{ color: "error.main" }}>{fmtPct(-r["avg loss%"])}</Box> },
          { key: "e", label: "Expectancy", render: (r) => <Box component="span" sx={{ color: tone(r["expectancy%"]) }}>{fmtPct(r["expectancy%"], 2)}</Box> },
          { key: "pf", label: "Profit factor", render: (r) => fmt(r["profit factor"]) },
        ]} />
        <Typography variant="caption" color="text.secondary">
          Baseline = every breakout with the same exits — the gap shows what the SEPA filters add.
        </Typography>

        {Object.entries(result.breakdowns).map(([k, rows]) => rows.length > 0 && (
          <Box key={k}>
            <SectionTitle>By {k}</SectionTitle>
            <DataTable rowKey={(r) => String(r.group)} rows={rows} cols={breakdownCols} maxHeight={320} />
          </Box>
        ))}

        {result.trades && result.trades.length > 0 && <>
          <SectionTitle right={<Typography variant="caption" color="text.secondary">newest 100 of {result.trades.length}</Typography>}>
            Trades
          </SectionTitle>
          <DataTable rowKey={(r, i) => `${r.symbol}-${r.date}-${i}`} rows={[...result.trades].reverse().slice(0, 100)}
                     onRowClick={(r) => onStock(String(r.symbol))} maxHeight={420} cols={[
            { key: "s", label: "Stock", render: (r) => <b>{String(r.symbol)}</b> },
            { key: "d", label: "Entry", render: (r) => String(r.date ?? "").slice(0, 10) },
            { key: "t", label: "Setup", align: "left", render: (r) => String(r.type ?? "") },
            { key: "g", label: "Grade", render: (r) => String(r.grade ?? "") },
            { key: "r", label: "Return", render: (r) => <Box component="span" sx={{ color: tone(r.ret as number) }}>{fmtPct(r.ret as number)}</Box> },
            { key: "x", label: "Exit", align: "left", render: (r) => String(r.reason ?? "") },
          ]} />
        </>}
      </>}

      {!result && !running && <Empty>No backtest yet — pick a rule profile and run it.</Empty>}
    </Box>
  );
}

const breakdownCols: Col<{ group: string } & Record<string, number | string | null>>[] = [
  { key: "g", label: "Group", render: (r) => <b>{r.group}</b> },
  { key: "n", label: "Trades", render: (r) => fmt(r.trades as number, 0) },
  { key: "w", label: "Win %", render: (r) => `${fmt(r["win%"] as number, 1)}%` },
  { key: "ag", label: "Avg gain", render: (r) => fmtPct(r["avg gain%"] as number) },
  { key: "al", label: "Avg loss", render: (r) => fmtPct(-(r["avg loss%"] as number)) },
  { key: "e", label: "Expectancy", render: (r) => <Box component="span" sx={{ color: tone(r["expectancy%"] as number) }}>{fmtPct(r["expectancy%"] as number, 2)}</Box> },
  { key: "pf", label: "PF", render: (r) => fmt(r["profit factor"] as number) },
];

function Curve({ result }: { result: BacktestResult }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !result.portfolio.curve.length) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#5f6b66", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "#f1f3f2" } },
      rightPriceScale: { borderColor: "#e3e7e5" }, timeScale: { borderColor: "#e3e7e5" },
    });
    const s = chart.addSeries(AreaSeries, { lineColor: "#1a7f37", topColor: "#1a7f3733", bottomColor: "#1a7f3705", lineWidth: 2 });
    s.setData(result.portfolio.curve.map((p) => ({ time: p.date, value: p.equity })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [result]);
  return <Box ref={ref} sx={{ height: 240, border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }} />;
}

/* ── saved runs ────────────────────────────────────────────────────────── */

function Runs({ onOpen }: { onOpen: () => void }) {
  const [runs, setRuns] = useState<BacktestRun[] | null>(null);
  const [err, setErr] = useState("");
  const load = () => api.backtestRuns().then((r) => setRuns(r.runs)).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);

  if (err) return <ErrorNote error={err} />;
  if (!runs) return <Loading />;
  if (!runs.length) return <Empty>No saved runs yet. Every backtest is saved here for comparison.</Empty>;
  const best = Math.max(...runs.map((r) => r["CAGR%"] ?? -1e9));

  return (
    <Box>
      <DataTable rowKey={(r) => r.id} rows={runs}
                 onRowClick={(r) => api.loadBacktestRun(r.id).then(onOpen)} cols={[
        { key: "l", label: "Run", render: (r) => <Box><b>{r.profile ?? "default"}</b>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>from {r.start} · {r.id.slice(0, 8)}</Typography></Box> },
        { key: "p", label: "Stop / chase", render: (r) => `${r.params?.stop_pct}% / ${r.params?.chase_pct}%` },
        { key: "n", label: "Trades", render: (r) => r.trades },
        { key: "w", label: "Win %", render: (r) => `${fmt(r["win%"], 1)}%` },
        { key: "e", label: "Expect.", render: (r) => fmtPct(r["expectancy%"], 2) },
        { key: "c", label: "CAGR", render: (r) => <Chip size="small" variant={r["CAGR%"] === best ? "filled" : "outlined"}
            color={r["CAGR%"] === best ? "success" : "default"} label={fmtPct(r["CAGR%"])} sx={{ height: 22 }} /> },
        { key: "d", label: "Max DD", render: (r) => <Box component="span" sx={{ color: "error.main" }}>{fmtPct(r["max DD%"])}</Box> },
        { key: "x", label: "", width: 44, render: (r) => (
            <Tooltip title="Delete run"><IconButton size="small" aria-label="delete run"
              onClick={(e) => { e.stopPropagation(); api.deleteBacktestRun(r.id).then((x) => setRuns(x.runs)); }}>
              <DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>) },
      ]} />
      <Typography variant="caption" color="text.secondary">Tap a run to open it in the Backtest tab. Best CAGR highlighted.</Typography>
    </Box>
  );
}

/* ── rule profiles ─────────────────────────────────────────────────────── */

function Profiles() {
  const [profiles, setProfiles] = useState<RuleProfile[]>([]);
  const [active, setActive] = useState("default");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", stop_pct: "7", chase_pct: "2", min_grade: "", max_pos: "8" });

  const load = () => api.profiles().then((p) => { setProfiles(p.profiles); setActive(p.active); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);

  const wrap = (fn: () => Promise<unknown>, ok: string) => {
    setErr(""); setMsg("");
    fn().then(() => { setMsg(ok); load(); }).catch((e) => setErr(String(e.message || e)));
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        The trading rules are the imported SEPA engine; a profile is a named set of its thresholds.
        The <b>active</b> profile drives Today's lists. Backtest a profile before activating it.
      </Typography>
      {err && <ErrorNote error={err} />}
      {msg && <Typography variant="body2" color="success.main" sx={{ mb: 1 }}>{msg}</Typography>}
      <Stack spacing={1}>
        {profiles.map((p) => (
          <Card key={p.name} variant="outlined" sx={{ borderLeft: 4, borderLeftColor: p.name === active ? "primary.main" : "divider" }}>
            <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>
                {p.name === active && <Chip size="small" color="primary" label="active" sx={{ height: 22 }} />}
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {p.name === "default" && !p.stop_pct ? "engine defaults (stop 7% · chase 2% · all grades · 8 positions)"
                    : `stop ${p.stop_pct ?? 7}% · chase ${p.chase_pct ?? 2}% · ${p.min_grade ? `grade ≥ ${p.min_grade}` : "all grades"} · ${p.max_pos ?? 8} positions`}
                </Typography>
                {p.name !== active && <Button size="small" onClick={() => wrap(() => api.saveSettings({ active_profile: p.name }), `${p.name} is now active — rescan from Today.`)}>Activate</Button>}
                {p.name !== "default" && p.name !== active && (
                  <IconButton size="small" aria-label={`delete ${p.name}`} onClick={() => wrap(() => api.deleteProfile(p.name), `${p.name} deleted`)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <SectionTitle>New profile</SectionTitle>
      <Card variant="outlined"><CardContent>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <TextField size="small" label="Name" value={form.name} placeholder="v2-tight-stop" sx={{ width: 170 }}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField size="small" label="Stop %" type="number" value={form.stop_pct} sx={{ width: 100 }}
                     onChange={(e) => setForm({ ...form, stop_pct: e.target.value })} helperText="3–15" />
          <TextField size="small" label="Chase %" type="number" value={form.chase_pct} sx={{ width: 100 }}
                     onChange={(e) => setForm({ ...form, chase_pct: e.target.value })} helperText="0.5–5" />
          <TextField size="small" select label="Min grade" value={form.min_grade} sx={{ width: 120 }}
                     onChange={(e) => setForm({ ...form, min_grade: e.target.value })}>
            <MenuItem value="">All</MenuItem><MenuItem value="A">A</MenuItem><MenuItem value="A+">A+</MenuItem>
          </TextField>
          <TextField size="small" label="Positions" type="number" value={form.max_pos} sx={{ width: 100 }}
                     onChange={(e) => setForm({ ...form, max_pos: e.target.value })} helperText="1–20" />
        </Stack>
        <Button variant="contained" sx={{ mt: 1.5 }} disabled={!form.name.trim()}
                onClick={() => wrap(() => api.saveProfile(form.name.trim(), {
                  stop_pct: Number(form.stop_pct) || undefined, chase_pct: Number(form.chase_pct) || undefined,
                  min_grade: form.min_grade || undefined, max_pos: Number(form.max_pos) || undefined,
                }), `Profile “${form.name.trim()}” saved — backtest it before activating.`)}>
          Save profile
        </Button>
      </CardContent></Card>
    </Box>
  );
}