import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { createChart, AreaSeries, ColorType } from "lightweight-charts";
import { api, BacktestResult } from "../api";

const pct = (v: number | null | undefined) => v == null ? "—" : `${v >= 0 ? "" : ""}${v.toFixed(1)}%`;
const n2 = (v: number | null | undefined) => v == null ? "—" : v.toFixed(2);

/** Stats table row set: SEPA-filtered vs all-breakouts baseline. */
function SummaryCards({ result }: { result: BacktestResult }) {
  return (
    <Stack spacing={1}>
      {result.summary.map((s) => (
        <Box key={s.set} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{s.set}</Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${s.trades} trades`} />
            <Chip size="small" label={`win ${pct(s["win%"])}`} color={s["win%"] >= 35 ? "success" : "default"} />
            <Chip size="small" label={`avg gain ${pct(s["avg gain%"])}`} color="success" variant="outlined" />
            <Chip size="small" label={`avg loss ${pct(s["avg loss%"])}`} color="error" variant="outlined" />
            <Chip size="small" label={`expectancy ${pct(s["expectancy%"])}`}
                  color={s["expectancy%"] > 0 ? "success" : "error"} />
            <Chip size="small" label={`profit factor ${n2(s["profit factor"])}`} />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function Curve({ result }: { result: BacktestResult }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !result.portfolio.curve.length) return;
    const chart = createChart(ref.current, {
      autoSize: true, height: 220,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#555" },
    });
    const series = chart.addSeries(AreaSeries, { lineColor: "#1a7f37", topColor: "#1a7f3733", bottomColor: "#1a7f3708" });
    series.setData(result.portfolio.curve.map((p) => ({ time: p.date, value: p.equity })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [result]);
  return <Box ref={ref} sx={{ border: 1, borderColor: "divider", borderRadius: 1, mt: 1 }} />;
}

function Breakdown({ title, rows }: { title: string; rows: Record<string, number | string | null>[] }) {
  if (!rows.length) return null;
  const cols = ["trades", "win%", "avg gain%", "avg loss%", "expectancy%", "profit factor"];
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>by {title}</Typography>
      <Table size="small" padding="none">
        <TableHead>
          <TableRow>
            <TableCell></TableCell>
            {cols.map((c) => <TableCell key={c} align="right">{c}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell>{String(r[Object.keys(r)[0]])}</TableCell>
              {cols.map((c) => (
                <TableCell key={c} align="right">
                  {typeof r[c] === "number" ? (String(c).includes("%") ? pct(r[c] as number) : n2(r[c] as number)) : "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function BacktestPage() {
  const [status, setStatus] = useState<{ running: boolean; status: string; has_result: boolean }>(
    { running: false, status: "", has_result: false });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [err, setErr] = useState("");
  const [start, setStart] = useState("2012-01-01");
  const [stopPct, setStopPct] = useState("7");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    api.backtestStatus().then((s) => {
      setStatus({ running: s.running, status: s.status, has_result: s.has_result });
      if (s.result) setResult(s.result);
      if (!s.running && poll.current) { clearInterval(poll.current); poll.current = null; }
    }).catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [refresh]);

  const run = async () => {
    setErr("");
    try {
      await api.runBacktest({ start, stop_pct: Number(stopPct) || undefined });
      refresh();
      poll.current = setInterval(refresh, 3000);   // a warm run is ~10 s; poll until done
    } catch (e) { setErr(String(e)); }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Replays the SEPA rules over past years on the same price data — would these
        rules have made money, and how bumpy was the ride?
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField size="small" label="From" value={start} onChange={(e) => setStart(e.target.value)} sx={{ width: 130 }} />
        <TextField size="small" label="Stop %" value={stopPct} onChange={(e) => setStopPct(e.target.value)} sx={{ width: 90 }} />
        <Button variant="contained" onClick={run} disabled={status.running}>
          {status.running ? "Running…" : "Run backtest"}
        </Button>
      </Stack>
      {status.running && <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <CircularProgress size={16} /><Typography variant="body2" color="text.secondary">
          Crunching years of trades — first run can take a minute or two.
        </Typography>
      </Stack>}
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {result && <>
        <Typography variant="caption" color="text.secondary">
          {result.stocks} stocks · {result.breakouts} breakouts since {result.start} · data to {result.asof}
        </Typography>
        <SummaryCards result={result} />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          <Chip size="small" variant="outlined" color="success" label={`Equity curve CAGR ${pct(result.portfolio["CAGR%"])}`} />
          <Chip size="small" variant="outlined" color="error" label={`Max drawdown ${pct(result.portfolio["max DD%"])}`} />
          <Chip size="small" variant="outlined" label={`Nifty 500: ${pct(result.portfolio["Nifty 500 CAGR%"])} CAGR, ${pct(result.portfolio["Nifty 500 max DD%"])} DD`} />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {result.params.max_pos} positions max · stop {result.params.stop_pct}% · chase {result.params.chase_pct}%
        </Typography>
        <Curve result={result} />
        {Object.entries(result.breakdowns).map(([k, rows]) => <Breakdown key={k} title={k} rows={rows} />)}
      </>}
    </Container>
  );
}