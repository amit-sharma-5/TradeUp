import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Chip, Container, Stack, Typography, Button, CircularProgress, Alert, IconButton, Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import SettingsIcon from "@mui/icons-material/Settings";
import SettingsDialog from "./SettingsDialog";
import { api, Signal, Health } from "../api";
import TradePage from "./TradePage";
import WatchlistsSection from "./Watchlists";
import StockEdgeDialog from "./StockEdgeDialog";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const GROUPS = ["Strong Buy", "Buy", "Watch"];
const GROUP_LABEL: Record<string, string> = { Watch: "Algo Watch" };  // engine list, named to avoid confusion with My Watch
const GROUP_COLOR: Record<string, "success" | "info" | "secondary"> = {
  "Strong Buy": "success", "Buy": "info", "Watch": "secondary",
};

export default function CandidatesPage({ tick, onChart }: { tick: number; onChart?: (symbol: string) => void }) {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState("");
  const [tradeSym, setTradeSym] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [seOpen, setSeOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);

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
        <Tooltip title="Settings, rule profiles, Dhan keys">
          <IconButton size="small" onClick={() => setCfgOpen(true)} aria-label="settings">
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Re-run the scan now">
          <IconButton size="small" onClick={refresh} aria-label="refresh signals">
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {seOpen && <StockEdgeDialog open={seOpen} close={() => setSeOpen(false)} />}
      {cfgOpen && <SettingsDialog open={cfgOpen} close={() => { setCfgOpen(false); setReload((r) => r + 1); }} />}
      {health?.signal_source === "sepa" && <WatchlistsSection onChart={onChart} />}
      {GROUPS.map((g) => {
        const rows = signals.filter((s) => s.category === g);
        if (!rows.length) return null;
        return (
          <Box key={g} sx={{ mb: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, ml: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%",
                         bgcolor: g === "Strong Buy" ? "success.main" : g === "Buy" ? "info.main" : "secondary.main" }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {GROUP_LABEL[g] ?? g}
              </Typography>
              <Typography variant="caption" color="text.secondary">{rows.length}</Typography>
            </Stack>
            <Stack spacing={1.5}>
              {rows.map((s) => (
                <Card key={s.symbol} variant="outlined" onClick={() => setTradeSym(s.symbol)}
                      sx={{ cursor: "pointer", position: "relative", overflow: "hidden",
                            transition: "box-shadow .15s ease, transform .15s ease",
                            "&:hover": { boxShadow: 4, transform: "translateY(-2px)" },
                            borderLeft: 4,
                            borderLeftColor: g === "Strong Buy" ? "success.main" : g === "Buy" ? "info.main" : "secondary.main" }}>
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{s.symbol}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{s.name}</Typography>
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>₹{fmt(s.ltp)}</Typography>
                      <Chip size="small" label={`${s.change_pct >= 0 ? "+" : ""}${fmt(s.change_pct)}%`}
                            color={s.change_pct >= 0 ? "success" : "error"} />
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 1 }} color="text.primary">{s.why}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip size="small" color={GROUP_COLOR[g]} label={`Buy point ₹${fmt(s.pivot)}`} />
                      <Chip size="small" variant="outlined" color="error" label={`Stop ₹${fmt(s.stop)}`} />
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
