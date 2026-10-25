import { useEffect, useRef, useState } from "react";
import {
  Box, Dialog, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CloseIcon from "@mui/icons-material/Close";
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  ColorType, CrosshairMode,
} from "lightweight-charts";
import { api, ChartData } from "../api";
import { ErrorNote, Loading } from "../ui";

type TF = "daily" | "weekly" | "both";

/** One candlestick panel: candles + volume + MAs + pivot/stop + breakout marks. */
export function PriceChart({ data, height }: { data: ChartData; height: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#5f6b66", fontSize: 11 },
      grid: { vertLines: { color: "#f1f3f2" }, horzLines: { color: "#f1f3f2" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e3e7e5" },
      timeScale: { borderColor: "#e3e7e5", timeVisible: false },
    });
    try {
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: "#1a7f37", downColor: "#c62828", borderVisible: false,
        wickUpColor: "#1a7f37", wickDownColor: "#c62828",
      });
      candles.setData(data.candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));

      const volume = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" } });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(data.candles.map((c) => ({
        time: c.date, value: c.volume, color: c.close >= c.open ? "#1a7f3740" : "#c6282840",
      })));

      const line = (pts: { date: string; value: number }[] | undefined, color: string, title: string) => {
        if (!pts?.length) return;
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title });
        s.setData(pts.map((p) => ({ time: p.date, value: p.value })));
      };
      if (data.tf === "weekly") {
        line(data.ma10w, "#f9a825", "10w"); line(data.ma30w, "#5c6bc0", "30w"); line(data.ma40w, "#8d6e63", "40w");
      } else {
        line(data.ma50, "#f9a825", "50d"); line(data.ma200, "#5c6bc0", "200d");
      }
      if (data.pivot != null)
        candles.createPriceLine({ price: data.pivot, color: "#1a7f37", lineWidth: 1, lineStyle: 2, title: "Pivot" });
      if (data.stop != null)
        candles.createPriceLine({ price: data.stop, color: "#c62828", lineWidth: 1, lineStyle: 2, title: "Stop" });
      // markers must be time-sorted and inside the visible candle range
      const first = data.candles[0]?.date ?? "";
      const marks = data.breakouts.filter((b) => b.date >= first).sort((a, b) => a.date.localeCompare(b.date));
      if (marks.length) {
        createSeriesMarkers(candles, marks.map((b) => ({
          time: b.date, position: "belowBar" as const, color: "#1a7f37", shape: "arrowUp" as const, text: b.type,
        })));
      }
      chart.timeScale().fitContent();
    } catch { /* a chart glitch must never blank the page */ }
    return () => chart.remove();
  }, [data]);

  return <Box ref={ref} sx={{ height, border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }} />;
}

/** Fetching wrapper: Daily / Weekly / D+W toggle, legend and full-screen. */
export default function StockChart({ symbol }: { symbol: string }) {
  const [tf, setTf] = useState<TF>("daily");
  const [full, setFull] = useState(false);
  const [daily, setDaily] = useState<ChartData | null>(null);
  const [weekly, setWeekly] = useState<ChartData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { setDaily(null); setWeekly(null); setErr(""); }, [symbol]);
  useEffect(() => {
    if (tf !== "weekly" && !daily) api.chart(symbol, "daily").then(setDaily).catch((e) => setErr(String(e.message || e)));
    if (tf !== "daily" && !weekly) api.chart(symbol, "weekly").then(setWeekly).catch((e) => setErr(String(e.message || e)));
  }, [symbol, tf, daily, weekly]);

  const toggle = (
    <ToggleButtonGroup size="small" exclusive value={tf} onChange={(_, v) => v && setTf(v)} aria-label="timeframe">
      <ToggleButton value="daily" sx={{ px: 1.2, py: 0.3 }}>Daily</ToggleButton>
      <ToggleButton value="weekly" sx={{ px: 1.2, py: 0.3 }}>Weekly</ToggleButton>
      <ToggleButton value="both" sx={{ px: 1.2, py: 0.3 }}>D + W</ToggleButton>
    </ToggleButtonGroup>
  );
  const legend = tf === "weekly" ? "10 / 30 / 40-week averages" : "50 / 200-day averages";
  const panels = (h: number) => (
    <Stack spacing={1}>
      {tf !== "weekly" && (daily ? <PriceChart data={daily} height={h} /> : <Loading />)}
      {tf !== "daily" && (weekly ? <PriceChart data={weekly} height={h} /> : <Loading />)}
    </Stack>
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1}>
        {toggle}
        <Box flexGrow={1} />
        <Tooltip title="Full screen">
          <IconButton size="small" onClick={() => setFull(true)} aria-label="full screen"><FullscreenIcon /></IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", my: 0.75 }}>
        {legend} · dashed lines: pivot / stop · ▲ breakouts
      </Typography>
      {err ? <ErrorNote error={err} /> : panels(tf === "both" ? 260 : 360)}

      <Dialog fullScreen open={full} onClose={() => setFull(false)}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, flexGrow: 1, ml: 1 }}>{symbol}</Typography>
          {toggle}
          <IconButton onClick={() => setFull(false)} aria-label="close full screen"><CloseIcon /></IconButton>
        </Stack>
        <Box sx={{ p: 1 }}>{panels(tf === "both" ? Math.floor((window.innerHeight - 90) / 2) : window.innerHeight - 80)}</Box>
      </Dialog>
    </Box>
  );
}