import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Chip, Container, Stack, Typography, Button, CircularProgress, Alert, IconButton, Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { api, Signal, Health } from "../api";
import TradePage from "./TradePage";
import WatchlistsSection from "./Watchlists";
import StockEdgeDialog from "./StockEdgeDialog";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const GROUPS = ["Strong Buy", "Buy", "Watch"];

export default function CandidatesPage({ tick, onChart }: { tick: number; onChart?: (symbol: string) => void }) {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState("");
  const [tradeSym, setTradeSym] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [seOpen, setSeOpen] = useState(false);

  useEffect(() => {
    api.candidates().then(setSignals).catch((e) => setErr(String(e)));
    api.health().then(setHealth).catch(() => {});
  }, [tick, reload]);

  const refresh = async () => {
    try {
      await api.refreshSignals();
      setTimeout(() => setReload((r) => r + 1), 4000);  // pick up the new scan shortly
    } catch { /* surfaced on the next poll */ }
  };

  if (tradeSym) {
    const s = signals?.find((x) => x.symbol === tradeSym);
    return s ? <TradePage signal={s} onDone={() => setTradeSym(null)} /> : null;
  }

  if (err) return <Container sx={{ mt: 4 }}><Alert severity="error">{err}</Alert></Container>;
  if (!signals) return <Container sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Container>;

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        {health && (
          <Tooltip title={health.signals?.status ?? ""}>
            <Chip
              size="small"
              color={health.signal_source === "sepa" ? "success" : "warning"}
              variant="outlined"
              label={health.signal_source === "sepa"
                ? `SEPA · scanned ${health.signals.asof || "…"}`
                : "mock signals (no SEPA engine)"}
            />
          </Tooltip>
        )}
        {health?.signals?.refreshing && <CircularProgress size={16} />}
        <Box flexGrow={1} />
        {health?.signal_source === "sepa" && (
          <Tooltip title="StockEdge fundamentals export">
            <IconButton size="small" onClick={() => setSeOpen(true)} aria-label="stockedge upload">
              <CloudUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Re-run the scan now">
          <IconButton size="small" onClick={refresh} aria-label="refresh signals">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {seOpen && <StockEdgeDialog open={seOpen} close={() => setSeOpen(false)} />}
      {health?.signal_source === "sepa" && <WatchlistsSection onChart={onChart} />}
      {GROUPS.map((g) => {
        const rows = signals.filter((s) => s.category === g);
        if (!rows.length) return null;
        return (
          <Box key={g} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>{g}</Typography>
            <Stack spacing={1.5}>
              {rows.map((s) => (
                <Card key={s.symbol} variant="outlined" onClick={() => setTradeSym(s.symbol)} sx={{ cursor: "pointer" }}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>{s.symbol}</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>₹{fmt(s.ltp)}</Typography>
                      <Chip size="small" label={`${s.change_pct >= 0 ? "+" : ""}${fmt(s.change_pct)}%`}
                            color={s.change_pct >= 0 ? "success" : "error"} variant="outlined" />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{s.name}</Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>{s.why}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
                      <Chip size="small" label={`Buy point ₹${fmt(s.pivot)}`} />
                      <Chip size="small" label={`Stop ₹${fmt(s.stop)}`} />
                      <Box flexGrow={1} />
                      {onChart && (
                        <Button size="small" onClick={(e) => { e.stopPropagation(); onChart(s.symbol); }}>
                          Chart
                        </Button>
                      )}
                      <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); setTradeSym(s.symbol); }}>
                        Trade
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        );
      })}
      {!signals.length && <Typography sx={{ mt: 6, textAlign: "center" }} color="text.secondary">
        No candidates today — doing nothing is a valid decision.
        <br />First launch? The engine scan runs in the background; this page refreshes automatically.
      </Typography>}
    </Container>
  );
}
