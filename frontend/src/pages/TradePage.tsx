import { useState } from "react";
import {
  Box, Button, Container, MenuItem, Stack, TextField, Typography, Alert, Paper, IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, Signal } from "../api";

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function TradePage({ signal, onDone }: { signal: Signal; onDone: () => void }) {
  const [kind, setKind] = useState("BUY_STOP");
  const [qty, setQty] = useState(10);
  const [limit, setLimit] = useState(signal.pivot);
  const [stop, setStop] = useState(signal.stop);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const risk = (limit - stop) * qty;

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.placeOrder({ symbol: signal.symbol, kind, qty, limit_price: limit, stop });
      setDone(r.trade_id);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <IconButton onClick={onDone}><ArrowBackIcon /></IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{signal.symbol}</Typography>
        <Box flexGrow={1} />
        <Typography variant="body1">₹{fmt(signal.ltp)}</Typography>
      </Stack>

      {done ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <Alert severity="success" sx={{ justifyContent: "center" }}>
            Paper order placed ({done}). It fills when price reaches your trigger.
          </Alert>
          <Button variant="contained" sx={{ mt: 2 }} onClick={onDone}>Back to candidates</Button>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack spacing={2}>
            <TextField select label="Order type" value={kind} onChange={(e) => setKind(e.target.value)}>
              <MenuItem value="BUY_STOP">Buy-stop (fills when price reaches trigger)</MenuItem>
              <MenuItem value="LIMIT">Limit (fills when price is at or below)</MenuItem>
            </TextField>
            <TextField label="Quantity" type="number" value={qty}
                       onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
            <TextField label={kind === "BUY_STOP" ? "Trigger price (pivot)" : "Limit price"} type="number"
                       value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            <TextField label="Stop-loss" type="number" value={stop}
                       onChange={(e) => setStop(Number(e.target.value))} helperText="Your automatic exit if the trade goes wrong" />
            <Alert severity="info" icon={false}>
              Risk on this trade: ₹{fmt(risk)} ({fmt(limit - stop)} per share)
            </Alert>
            {err && <Alert severity="error">{err}</Alert>}
            <Button variant="contained" size="large" disabled={busy} onClick={submit}>
              {busy ? "Placing…" : "Preview & confirm paper order"}
            </Button>
          </Stack>
        </Paper>
      )}
    </Container>
  );
}
