import { useEffect, useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, TextField, Typography, CircularProgress, Alert, Divider,
} from "@mui/material";
import { api, Trade } from "../api";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const STATUS_COLOR: Record<string, "success" | "warning" | "default" | "error"> = {
  OPEN: "success", PLANNED: "warning", CLOSED: "default", CANCELLED: "error",
};

export default function JournalPage({ tick, onChart }: { tick: number; onChart?: (symbol: string) => void }) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [err, setErr] = useState("");
  const [dialog, setDialog] = useState<{ kind: "stop" | "exit" | "note"; trade: Trade } | null>(null);

  const load = () => api.journal().then((d) => setTrades(d.trades)).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); setDialog(null); load(); }
    catch (e) { setErr(String(e)); }
  };

  const tradeCard = (t: Trade) => {
    const pnl = t.status === "OPEN" ? t.unrealized_pnl : t.pnl;
    const pnlPct = t.status === "OPEN" ? t.unrealized_pnl_pct : t.pnl_pct;
    return (
      <Card key={t.id} variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>{t.symbol}</Typography>
            {pnl != null && (
              <Chip size="small" label={`${pnl >= 0 ? "+" : ""}₹${fmt(pnl)} (${fmt(pnlPct)}%)`}
                    color={pnl >= 0 ? "success" : "error"} />
            )}
            <Chip size="small" label={t.status} color={STATUS_COLOR[t.status] ?? "default"} />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2">Qty {t.qty}</Typography>
            <Typography variant="body2">Entry ₹{fmt(t.entry_price)}</Typography>
            {t.status === "OPEN" && t.last_price != null &&
              <Typography variant="body2">Last ₹{fmt(t.last_price)}</Typography>}
            <Typography variant="body2">Stop ₹{fmt(t.stop)}</Typography>
            {t.exit_price != null && <Typography variant="body2">Exit ₹{fmt(t.exit_price)}</Typography>}
            {onChart && (
              <Typography variant="body2" color="primary" sx={{ cursor: "pointer", ml: "auto" }}
                          onClick={() => onChart(t.symbol)}>
                Chart
              </Typography>
            )}
          </Stack>
          {t.exit_reason && <Typography variant="body2" color="text.secondary">{t.exit_reason}</Typography>}
          {t.note && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: "italic" }}>
              📝 {t.note}
            </Typography>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
            {(t.status === "PLANNED" || t.status === "OPEN") && (
              <>
                <Button size="small" onClick={() => setDialog({ kind: "stop", trade: t })}>Move stop</Button>
                {t.status === "PLANNED"
                  ? <Button size="small" color="error" onClick={() => act(() => api.cancelOrder(t.id))}>Cancel</Button>
                  : <Button size="small" color="warning" onClick={() => setDialog({ kind: "exit", trade: t })}>Record exit</Button>}
              </>
            )}
            <Button size="small" onClick={() => setDialog({ kind: "note", trade: t })}>
              {t.note ? "Edit note" : "Add note"}
            </Button>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            What happened
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {t.events.map((e, i) => (
              <Typography key={i} variant="body2">
                <b>{e.event.replace(/_/g, " ")}</b> · {e.ts}
                {e.price != null && <> @ ₹{fmt(e.price)}</>}
                {e.reason && <span> — {e.reason}</span>}
              </Typography>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (err) return <Container sx={{ mt: 4 }}><Alert severity="error">{err}</Alert></Container>;
  if (!trades) return <Container sx={{ mt: 8, textAlign: "center" }}><CircularProgress /></Container>;

  const open = trades.filter((t) => t.status === "PLANNED" || t.status === "OPEN");
  const closed = trades.filter((t) => t.status === "CLOSED" || t.status === "CANCELLED");
  const realized = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      {closed.length > 0 && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Chip size="small" variant="outlined"
                label={`Realized P&L ${realized >= 0 ? "+" : ""}₹${fmt(realized)}`}
                color={realized >= 0 ? "success" : "error"} />
          <Typography variant="caption" color="text.secondary">
            across {closed.length} closed trade{closed.length > 1 ? "s" : ""}
          </Typography>
        </Stack>
      )}
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
      {dialog && <ActionDialog dialog={dialog} close={() => setDialog(null)} act={act} />}
    </Container>
  );
}

/** Move stop / record exit / note — the review-loop actions on a trade. */
function ActionDialog({ dialog, close, act }: {
  dialog: { kind: "stop" | "exit" | "note"; trade: Trade };
  close: () => void;
  act: (fn: () => Promise<unknown>) => void;
}) {
  const { kind, trade } = dialog;
  const [stop, setStop] = useState(String(trade.stop ?? ""));
  const [price, setPrice] = useState(String(trade.last_price ?? ""));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(trade.note ?? "");
  const title = kind === "stop" ? `Move stop — ${trade.symbol}`
    : kind === "exit" ? `Record exit — ${trade.symbol}` : `Note — ${trade.symbol}`;
  return (
    <Dialog open onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {kind === "stop" && (
            <TextField label="New stop-loss" type="number" value={stop} autoFocus
                       onChange={(e) => setStop(e.target.value)}
                       helperText="Stays below the entry; journaled as stop_moved" />)}
          {kind === "exit" && <>
            <TextField label="Exit price" type="number" value={price} autoFocus
                       onChange={(e) => setPrice(e.target.value)} />
            <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)}
                       placeholder="target hit / rule exit / …" />
          </>}
          {kind === "note" && (
            <TextField label="Note / lesson" value={note} autoFocus multiline minRows={3}
                       onChange={(e) => setNote(e.target.value)}
                       helperText="What did this trade teach you? Saved with the trade." />)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={() => {
          if (kind === "stop") return act(() => api.moveStop(trade.id, Number(stop)));
          if (kind === "exit") return act(() => api.recordExit(trade.id, Number(price), reason));
          return act(() => api.setNote(trade.id, note));
        }}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}