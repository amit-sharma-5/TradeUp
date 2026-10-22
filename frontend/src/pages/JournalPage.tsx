import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Chip, Container, Stack, Typography, CircularProgress, Alert, Divider,
} from "@mui/material";
import { api, Trade } from "../api";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const STATUS_COLOR: Record<string, "success" | "warning" | "default" | "error"> = {
  OPEN: "success", PLANNED: "warning", CLOSED: "default", CANCELLED: "error",
};

export default function JournalPage({ tick }: { tick: number }) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.journal().then((d) => setTrades(d.trades)).catch((e) => setErr(String(e)));
  }, [tick]);

  if (err) return <Container sx={{ mt: 4 }}><Alert severity="error">{err}</Alert></Container>;
  if (!trades) return <Container sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Container>;

  const open = trades.filter((t) => t.status === "PLANNED" || t.status === "OPEN");
  const closed = trades.filter((t) => t.status === "CLOSED" || t.status === "CANCELLED");

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      {open.length > 0 && <>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>Open / planned</Typography>
        <Stack spacing={1.5} sx={{ mb: 3 }}>{open.map(tradeCard)}</Stack>
      </>}
      {closed.length > 0 && <>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>Closed</Typography>
        <Stack spacing={1.5}>{closed.map(tradeCard)}</Stack>
      </>}
      {!trades.length && (
        <Typography sx={{ mt: 6, textAlign: "center" }} color="text.secondary">
          No paper trades yet. Pick a candidate and place your first one.
        </Typography>
      )}
    </Container>
  );
}

function tradeCard(t: Trade) {
  return (
    <Card key={t.id} variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>{t.symbol}</Typography>
          <Chip size="small" label={t.status} color={STATUS_COLOR[t.status] ?? "default"} />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2">Qty {t.qty}</Typography>
          <Typography variant="body2">Entry ₹{fmt(t.entry_price)}</Typography>
          <Typography variant="body2">Stop ₹{fmt(t.stop)}</Typography>
          {t.exit_price != null && <Typography variant="body2">Exit ₹{fmt(t.exit_price)}</Typography>}
        </Stack>
        {t.exit_reason && <Typography variant="body2" color="text.secondary">{t.exit_reason}</Typography>}
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          What happened
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {t.events.map((e, i) => (
            <Typography key={i} variant="body2">
              <b>{e.event.replace(/_/g, " ")}</b> · {e.ts}
              {e.price != null && <> @ ₹{fmt(e.price)}</>}
              {e.reason && <span color="text.secondary"> — {e.reason}</span>}
            </Typography>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
