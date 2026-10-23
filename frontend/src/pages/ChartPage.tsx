import { useEffect, useRef, useState } from "react";
import {
  Box, Button, Chip, CircularProgress, Container, IconButton, Stack, Typography, Alert, Autocomplete, TextField,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries,
  createSeriesMarkers, type IChartApi, ColorType, CrosshairMode,
} from "lightweight-charts";
import { api, ChartData, Signal, StockSymbol } from "../api";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

/** Candlestick chart for one symbol: price + MAs + volume, pivot/stop guide
 *  lines and breakout markers — the numbers behind the "why". With symbol=""
 *  it starts in search mode so any NIFTY 500 stock can be looked up. */
export default function ChartPage({ symbol, onBack, onTrade }:
  { symbol?: string | null; onBack?: () => void; onTrade?: (sig: Signal) => void }) {
  const [current, setCurrent] = useState<string | null>(symbol ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ChartData | null>(null);
  const [err, setErr] = useState("");
  const [allSymbols, setAllSymbols] = useState<StockSymbol[] | null>(null);

  useEffect(() => {
    if (current == null) api.symbols().then(setAllSymbols).catch((e) => setErr(String(e)));
  }, [current == null]);

  useEffect(() => {
    if (!current) return;
    setData(null);
    setErr("");
    api.chart(current).then(setData).catch((e) => setErr(String(e)));
  }, [current]);

  const pick = (s: StockSymbol | null) => { if (s) setCurrent(s.symbol); };

  if (!current) {
    return (
      <Container maxWidth="sm" sx={{ mt: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {onBack && <IconButton onClick={onBack} aria-label="back"><ArrowBackIcon /></IconButton>}
          <SearchIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Search a stock</Typography>
        </Stack>
        {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
        <Autocomplete
          sx={{ mt: 3 }}
          options={allSymbols ?? []}
          loading={allSymbols == null}
          onChange={(_, v) => pick(v)}
          getOptionLabel={(s) => s.symbol}
          renderOption={(props, s) => (
            <li {...props} key={s.symbol}>
              <Box>
                <Typography variant="body1">{s.symbol}</Typography>
                <Typography variant="caption" color="text.secondary">{s.name} · {s.industry}</Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => <TextField {...params} label="Symbol or company name" autoFocus />}
          filterOptions={(opts, { inputValue }) => {
            const q = inputValue.trim().toLowerCase();
            return opts.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 25);
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: "center" }}>
          Any of the 500 NIFTY members — not just today's candidates.
        </Typography>
      </Container>
    );
  }

  useEffect(() => {
    if (!data || !ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#555" },
      grid: { vertLines: { color: "#f0f0f0" }, horzLines: { color: "#f0f0f0" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e0e0e0" },
      timeScale: { borderColor: "#e0e0e0", timeVisible: false },
    });

    try {
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: "#1a7f37", downColor: "#c62828", borderVisible: false,
        wickUpColor: "#1a7f37", wickDownColor: "#c62828",
      });
      candles.setData(data.candles.map((c) => ({
        time: c.date, open: c.open, high: c.high, low: c.low, close: c.close,
      })));

      const volume = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" } });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volume.setData(data.candles.map((c) => ({
        time: c.date, value: c.volume,
        color: c.close >= c.open ? "#1a7f3744" : "#c6282844",
      })));

      const line = (pts: { date: string; value: number }[], color: string, title: string) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s.setData(pts.map((p) => ({ time: p.date, value: p.value })));
        s.applyOptions({ title });
      };
      line(data.ma50, "#f9a825", "MA50");
      line(data.ma200, "#5c6bc0", "MA200");

      if (data.pivot != null)
        candles.createPriceLine({ price: data.pivot, color: "#1a7f37", lineWidth: 1, lineStyle: 2, title: "Pivot" });
      if (data.stop != null)
        candles.createPriceLine({ price: data.stop, color: "#c62828", lineWidth: 1, lineStyle: 2, title: "Stop" });

      if (data.breakouts.length) {
        createSeriesMarkers(candles, data.breakouts.map((b) => ({
          time: b.date, position: "belowBar", color: "#1a7f37", shape: "arrowUp",
          text: b.type,
        })));
      }

      chart.timeScale().fitContent();
    } catch (e) {
      setErr(String(e));
    }
    return () => chart.remove();
  }, [data]);

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        {onBack && <IconButton onClick={onBack} aria-label="back"><ArrowBackIcon /></IconButton>}
        {!onBack && (
          <IconButton onClick={() => setCurrent(null)} aria-label="search another stock">
            <SearchIcon />
          </IconButton>
        )}
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>{current}</Typography>
        {data && <>
          <Chip size="small" label={`Stage ${data.stage}`} color={data.stage === 2 ? "success" : "default"} variant="outlined" />
          {data.rs != null && <Chip size="small" label={`RS ${fmt(data.rs, 0)}`} variant="outlined" />}
          <Chip size="small" label={data.tt ? "Trend Template ✓" : "TT ✗"}
                color={data.tt ? "success" : "default"} variant="outlined" />
        </>}
      </Stack>
      {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      {!data && !err && <Box sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Box>}
      {data && (
        <>
          <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 1 }} alignItems="center">
            {data.pivot != null && <Typography variant="caption">Buy point ₹{fmt(data.pivot)}</Typography>}
            {data.stop != null && <Typography variant="caption">Stop ₹{fmt(data.stop)}</Typography>}
            <Typography variant="caption" color="text.secondary">
              {data.breakouts.length} breakout{data.breakouts.length === 1 ? "" : "s"} on chart
            </Typography>
            <Box flexGrow={1} />
            {onTrade && (
              <Button size="small" variant="outlined" onClick={() => {
                const last = data.candles[data.candles.length - 1].close;
                const pivot = data.pivot ?? last;
                onTrade({
                  symbol: data.symbol, name: data.symbol, category: "Watch",
                  ltp: last, change_pct: 0, pivot,
                  stop: data.stop ?? Math.round(pivot * 0.93 * 100) / 100,
                  why: "Manual paper trade from chart (not in today's screener)",
                });
              }}>
                Paper trade
              </Button>
            )}
          </Stack>
          <Box ref={ref} sx={{ height: 380, border: 1, borderColor: "divider", borderRadius: 1 }} />
        </>
      )}
    </Container>
  );
}