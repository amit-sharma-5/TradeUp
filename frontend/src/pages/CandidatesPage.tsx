import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Chip, Container, Stack, Typography, Button, CircularProgress, Alert,
} from "@mui/material";
import { api, Signal } from "../api";
import TradePage from "./TradePage";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const GROUPS = ["Strong Buy", "Buy", "Watch"];

export default function CandidatesPage({ tick }: { tick: number }) {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [err, setErr] = useState("");
  const [tradeSym, setTradeSym] = useState<string | null>(null);

  useEffect(() => { api.candidates().then(setSignals).catch((e) => setErr(String(e))); }, [tick]);

  if (tradeSym) {
    const s = signals?.find((x) => x.symbol === tradeSym);
    return s ? <TradePage signal={s} onDone={() => setTradeSym(null)} /> : null;
  }

  if (err) return <Container sx={{ mt: 4 }}><Alert severity="error">{err}</Alert></Container>;
  if (!signals) return <Container sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Container>;

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
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
