import { useEffect, useRef, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Container, Dialog,
  IconButton, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries,
  createSeriesMarkers, ColorType, CrosshairMode,
} from "lightweight-charts";
import { api, ChartData, NewsItem, Signal, StockSymbol } from "../api";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

type TF = "daily" | "weekly" | "both";

/** Candlestick chart for one symbol — Daily / Weekly / D+W, fullscreen,
 *  pivot/stop guide lines and breakout markers. With no symbol it starts in
 *  search mode so any NIFTY 500 stock can be looked up. */
export default function ChartPage({ symbol, onBack, onTrade }:
  { symbol?: string | null; onBack?: () => void; onTrade?: (sig: Signal) => void }) {
  const [current, setCurrent] = useState<string | null>(symbol ?? null);
  const [tf, setTf] = useState<TF>("daily");
  const [full, setFull] = useState(false);
  const [dataD, setDataD] = useState<ChartData | null>(null);
  const [dataW, setDataW] = useState<ChartData | null>(null);
  const [err, setErr] = useState("");
  const [allSymbols, setAllSymbols] = useState<StockSymbol[] | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);

  // ── all hooks live above the conditional returns (React rule of hooks) ──
  useEffect(() => {
    if (current != null) return;
    api.symbols().then(setAllSymbols).catch((e) => setErr(String(e)));
  }, [current]);

  useEffect(() => {
    if (!current) return;
    setNews(null);
    api.news(current).then((n) => setNews(Array.isArray(n) ? n : [])).catch(() => setNews([]));
  }, [current]);

  // Reset cached series when the symbol changes; fetch each needed timeframe once.
  const fetched = useRef<{ D?: string; W?: string }>({});
  useEffect(() => {
    fetched.current = {};
    setDataD(null);
    setDataW(null);
    setErr("");
  }, [current]);

  useEffect(() => {
    if (!current || tf === "weekly" || fetched.current.D === current) return;
    fetched.current.D = current;
    api.chart(current, "daily").then(setDataD).catch((e) => setErr(String(e)));
  }, [current, tf]);

  useEffect(() => {
    if (!current || tf === "daily" || fetched.current.W === current) return;
    fetched.current.W = current;
    api.chart(current, "weekly").then(setDataW).catch((e) => setErr(String(e)));
  }, [current, tf]);

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

  const data = tf === "weekly" ? dataW : dataD;
  const showDaily = tf !== "weekly";
  const showWeekly = tf !== "daily";

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        {onBack ? <IconButton onClick={onBack} aria-label="back"><ArrowBackIcon /></IconButton>
                : <IconButton onClick={() => setCurrent(null)} aria-label="search another stock"><SearchIcon /></IconButton>}
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>{current}</Typography>
        <Tooltip title="Full screen">
          <IconButton onClick={() => setFull(true)} aria-label="fullscreen"><FullscreenIcon /></IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5, mb: 1 }} flexWrap="wrap" useFlexGap>
        {data && <>
          <Chip size="small" label={`Stage ${data.stage}`} color={data.stage === 2 ? "success" : "default"} variant="outlined" />
          {data.rs != null && <Chip size="small" label={`RS ${fmt(data.rs, 0)}`} variant="outlined" />}
          <Chip size="small" label={data.tt ? "Trend Template ✓" : "TT ✗"}
                color={data.tt ? "success" : "default"} variant="outlined" />
        </>}
        <Box flexGrow={1} />
        <ToggleButtonGroup size="small" exclusive value={tf} onChange={(_, v) => v && setTf(v)}
                           aria-label="timeframe">
          <ToggleButton value="daily">Daily</ToggleButton>
          <ToggleButton value="weekly">Weekly</ToggleButton>
          <ToggleButton value="both">D + W</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      {!data && !err && <Box sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Box>}
      {data && (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 1 }} alignItems="center" flexWrap="wrap" useFlexGap>
            {data.pivot != null && <Typography variant="caption">Buy point ₹{fmt(data.pivot)}</Typography>}
            {data.stop != null && <Typography variant="caption">Stop ₹{fmt(data.stop)}</Typography>}
            <Typography variant="caption" color="text.secondary">
              {data.breakouts.length} breakout{data.breakouts.length === 1 ? "" : "s"}
            </Typography>
            <Box flexGrow={1} />
            {onTrade && data.candles.length > 0 && (
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
          {showDaily && dataD && <PriceChart data={dataD} height={tf === "both" ? 280 : 380} />}
          {showWeekly && dataW && <PriceChart data={dataW} height={tf === "both" ? 280 : 380} />}
          {news && news.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                News naming the company (reputable newsrooms)
              </Typography>
              <Stack spacing={0.5}>
                {news.slice(0, 6).map((nn, i) => (
                  <Typography key={i} variant="body2" component="div">
                    <a href={nn.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                      {nn.title}
                    </a>
                    <Typography variant="caption" color="text.secondary" component="span">
                      {" "}— {nn.source}{nn.tags ? ` · ${nn.tags}` : ""}
                    </Typography>
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}
      {/* full screen view of the same series */}
      <Dialog fullScreen open={full} onClose={() => setFull(false)}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1 }}>
          <IconButton onClick={() => setFull(false)} aria-label="exit fullscreen">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>{current}</Typography>
          <ToggleButtonGroup size="small" exclusive value={tf} onChange={(_, v) => v && setTf(v)}>
            <ToggleButton value="daily">Daily</ToggleButton>
            <ToggleButton value="weekly">Weekly</ToggleButton>
            <ToggleButton value="both">D + W</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Box sx={{ flexGrow: 1, px: 1, display: "flex", flexDirection: "column", gap: 1 }}>
          {showDaily && dataD && <PriceChart data={dataD} height={showWeekly ? 380 : 640} />}
          {showWeekly && dataW && <PriceChart data={dataW} height={showDaily ? 380 : 640} />}
        </Box>
      </Dialog>
    </Container>
  );
}

/** One candlestick panel: candles + volume + MAs + pivot/stop + breakout marks. */
function PriceChart({ data, height }: { data: ChartData; height: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || !ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true, height,
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

      const line = (pts: { date: string; value: number }[] | undefined, color: string, title: string) => {
        if (!pts?.length) return;
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s.setData(pts.map((p) => ({ time: p.date, value: p.value })));
        s.applyOptions({ title });
      };
      if (data.tf === "weekly") {
        line(data.ma10w, "#f9a825", "10w");
        line(data.ma30w, "#5c6bc0", "30w");
        line(data.ma40w, "#8d6e63", "40w");
      } else {
        line(data.ma50, "#f9a825", "MA50");
        line(data.ma200, "#5c6bc0", "MA200");
      }

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
    } catch { /* a chart glitch must never blank the page */ }
    return () => chart.remove();
  }, [data, height]);

  return (
    <Box ref={ref} sx={{ height, border: 1, borderColor: "divider", borderRadius: 1, mb: 1 }} />
  );
}