import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, IconButton, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, Signal, TicketPlan } from "../api";
import { fmt, money, Stat } from "../ui";

/** Paper order ticket. Prefilled from the signal; the engine's plan suggests
 *  the quantity and flags rule problems (chase, wide stop, too much risk). */
export default function TradePage({ signal, onDone }: { signal: Signal; onDone: () => void }) {
  const [kind, setKind] = useState("BUY_STOP");
  const [entry, setEntry] = useState(String(signal.pivot));
  const [stop, setStop] = useState(String(signal.stop));
  const [qty, setQty] = useState("");
  const [plan, setPlan] = useState<TicketPlan | null>(null);
  const [touchedQty, setTouchedQty] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const e = Number(entry), s = Number(stop), q = Math.floor(Number(qty));
  const valid = e > 0 && s > 0 && s < e && q > 0;

  // engine sizing, debounced while typing
  useEffect(() => {
    if (!(e > 0 && s > 0 && s < e)) return;
    const t = setTimeout(() => {
      api.ticket(signal.symbol, { entry: e, stop: s }).then((p) => {
        setPlan(p);
        if (!touchedQty && p.qty > 0) setQty(String(p.qty));
      }).catch(() => setPlan(null));
    }, 300);
    return () => clearTimeout(t);
  }, [signal.symbol, e, s]);       // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!valid) return;
    setBusy(true); setErr("");
    try {
      const r = await api.placeOrder({ symbol: signal.symbol, kind, qty: q, limit_price: e, stop: s });
      setDone(r.trade_id);
    } catch (x) { setErr(String((x as Error).message || x)); }
    finally { setBusy(false); }
  };

  const risk = valid ? (e - s) * q : null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={onDone} aria-label="back" edge="start"><ArrowBackIcon /></IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>Paper order · {signal.symbol}</Typography>
          <Typography variant="body2" color="text.secondary">Now ₹{fmt(signal.ltp)} · buy point ₹{fmt(signal.pivot)}</Typography>
        </Box>
      </Stack>

      {signal.why && <Typography variant="body2" sx={{ mb: 1.5 }}>{signal.why}</Typography>}

      {done ? (
        <Card variant="outlined"><CardContent sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Paper order placed</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {kind === "BUY_STOP" ? `Fills automatically if the price reaches ₹${fmt(e)} (cancelled instead if it gaps past the chase limit).`
                                 : `Fills automatically if the price is at or below ₹${fmt(e)}.`} Track it in Portfolio.
          </Typography>
          <Button variant="contained" sx={{ mt: 2 }} onClick={onDone}>Done</Button>
        </CardContent></Card>
      ) : (
        <Card variant="outlined"><CardContent>
          <Stack spacing={2}>
            <TextField select label="Order type" value={kind} onChange={(x) => setKind(x.target.value)}>
              <MenuItem value="BUY_STOP">Buy-stop — buy when price breaks up through the trigger</MenuItem>
              <MenuItem value="LIMIT">Limit — buy at this price or lower</MenuItem>
            </TextField>
            <Stack direction="row" spacing={1.5}>
              <TextField fullWidth label={kind === "BUY_STOP" ? "Trigger (₹)" : "Limit (₹)"} type="number" value={entry}
                         onChange={(x) => setEntry(x.target.value)} />
              <TextField fullWidth label="Stop-loss (₹)" type="number" value={stop} onChange={(x) => setStop(x.target.value)}
                         error={s >= e} helperText={s >= e ? "Stop must be below the entry" : `${e > 0 ? fmt((1 - s / e) * 100, 1) : "—"}% below`} />
            </Stack>
            <TextField label="Shares" type="number" value={qty}
                       onChange={(x) => { setTouchedQty(true); setQty(x.target.value); }}
                       helperText={plan ? `Suggested ${plan.qty} by your sizing rule${plan.capped ? " (capped by max position)" : ""}` : " "} />

            <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
              <Stat label="Position" value={valid ? money(e * q) : "—"} />
              <Stat label="Risk if stopped" value={money(risk)} color="error.main" />
              {plan && <Stat label="+2R / +3R" value={`₹${fmt(plan.r2, 0)} / ₹${fmt(plan.r3, 0)}`} color="success.main" />}
            </Stack>
            {plan && plan.problems.length > 0 && <Alert severity="warning">{plan.problems.join(" · ")}</Alert>}
            {err && <Alert severity="error">{err}</Alert>}
            <Button variant="contained" size="large" disabled={busy || !valid} onClick={submit}>
              {busy ? "Placing…" : "Place paper order"}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              Paper only — no real money, no broker.
            </Typography>
          </Stack>
        </CardContent></Card>
      )}
    </Box>
  );
}