import { useEffect, useState } from "react";
import {
  Box, Button, Card, CardContent, Chip, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { api, Holding, JournalStats, Trade } from "../api";
import { Empty, ErrorNote, fmt, fmtPct, Loading, money, PageHeader, SectionTitle, Stat, StatStrip, tone } from "../ui";

type DialogState = { kind: "stop" | "exit" | "note"; trade: Trade } | null;

/** Positions (with the engine's Sell/Add/Partial/Hold verdict), pending
 *  orders, and the closed-trade review with TTLC statistics. */
export default function PortfolioPage({ tick, onStock }: { tick: number; onStock: (s: string) => void }) {
  const [tab, setTab] = useState(0);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [err, setErr] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api.journal().then((d) => { setTrades(d.trades); setErr(""); }).catch((e) => setErr(String(e.message || e)));
    api.holdings().then((h) => setHoldings(h.holdings)).catch(() => {});
    api.journalStats().then(setStats).catch(() => {});
  }, [tick, reload]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); setDialog(null); setReload((r) => r + 1); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };

  const open = (trades ?? []).filter((t) => t.status === "OPEN");
  const pending = (trades ?? []).filter((t) => t.status === "PLANNED");
  const done = (trades ?? []).filter((t) => t.status === "CLOSED" || t.status === "CANCELLED").reverse();
  const unrealized = open.reduce((s, t) => s + (t.unrealized_pnl ?? 0), 0);
  const verdict = Object.fromEntries(holdings.map((h) => [h.id, h]));

  return (
    <Box>
      <PageHeader title="Portfolio" subtitle="Your paper positions, orders and their full story"
                  actions={<Button size="small" startIcon={<DownloadIcon />} href={api.journalCsvUrl} download>CSV</Button>} />

      <StatStrip>
        <Stat label="Open positions" value={open.length} />
        <Stat label="Pending orders" value={pending.length} />
        <Stat label="Unrealized P&L" value={money(unrealized)} color={tone(unrealized)} />
        <Stat label="Realized P&L" value={money(stats?.total_pnl ?? 0)} color={tone(stats?.total_pnl ?? 0)} />
        <Stat label="Win rate" value={stats?.closed_trades ? `${fmt(stats.win_pct, 0)}%` : "—"}
              hint="Batting average on closed trades" />
      </StatStrip>

      {err && <ErrorNote error={err} />}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 2, mb: 1, "& .MuiTab-root": { textTransform: "none", fontWeight: 700 } }}>
        <Tab label={`Positions · ${open.length}`} />
        <Tab label={`Orders · ${pending.length}`} />
        <Tab label={`Closed · ${done.length}`} />
      </Tabs>

      {!trades ? <Loading /> : <>
        {tab === 0 && (open.length === 0 ? <Empty>No open positions. Paper-trade a candidate from Today.</Empty> : (
          <Stack spacing={1.25}>
            {open.map((t) => <TradeCard key={t.id} t={t} verdict={verdict[t.id]} onStock={onStock}
                                        onAction={(kind) => setDialog({ kind, trade: t })} />)}
          </Stack>
        ))}
        {tab === 1 && (pending.length === 0 ? <Empty>No pending orders. Buy-stop orders wait here until price reaches the trigger.</Empty> : (
          <Stack spacing={1.25}>
            {pending.map((t) => <TradeCard key={t.id} t={t} onStock={onStock}
                                           onAction={(kind) => setDialog({ kind, trade: t })}
                                           onCancel={() => act(() => api.cancelOrder(t.id))} />)}
          </Stack>
        ))}
        {tab === 2 && <>
          {stats && stats.closed_trades > 0 && <>
            <SectionTitle>Your statistics (TTLC)</SectionTitle>
            <StatStrip>
              <Stat label="Closed trades" value={stats.closed_trades} />
              <Stat label="Batting average" value={`${fmt(stats.win_pct, 0)}%`} />
              <Stat label="Avg gain" value={fmtPct(stats.avg_gain_pct)} color="success.main" />
              <Stat label="Avg loss" value={fmtPct(-(stats.avg_loss_pct ?? 0))} color="error.main" />
              <Stat label="Gain / loss" value={stats.gain_loss_ratio == null ? "—" : `${fmt(stats.gain_loss_ratio)}×`}
                    hint="Average gain ÷ average loss — above 2 is healthy" />
              <Stat label="Expectancy" value={fmtPct(stats.expectancy_pct)} color={tone(stats.expectancy_pct)}
                    hint="Average return per trade" />
              <Stat label="Avg R" value={stats.avg_r == null ? "—" : fmt(stats.avg_r)} />
              {!!stats.auto_trades && <Stat label="⚡ auto trades" value={stats.auto_trades} />}
            </StatStrip>
          </>}
          <SectionTitle>Closed & cancelled</SectionTitle>
          {done.length === 0 ? <Empty>Nothing closed yet — your review starts with the first exit.</Empty> : (
            <Stack spacing={1.25}>
              {done.map((t) => <TradeCard key={t.id} t={t} onStock={onStock}
                                          onAction={(kind) => setDialog({ kind, trade: t })} />)}
            </Stack>
          )}
        </>}
      </>}

      {dialog && <ActionDialog d={dialog} close={() => setDialog(null)} act={act} />}
    </Box>
  );
}

function TradeCard({ t, verdict, onStock, onAction, onCancel }: {
  t: Trade; verdict?: Holding; onStock: (s: string) => void;
  onAction: (k: "stop" | "exit" | "note") => void; onCancel?: () => void;
}) {
  const [story, setStory] = useState(false);
  const pnl = t.status === "OPEN" ? t.unrealized_pnl : t.pnl;
  const pnlPct = t.status === "OPEN" ? t.unrealized_pnl_pct : t.pnl_pct;
  const sell = verdict?.action.includes("Sell");
  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: sell ? "error.main" : t.status === "OPEN" ? "success.main" : "divider" }}>
      <CardContent sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography component="button" onClick={() => onStock(t.symbol)}
                      sx={{ fontWeight: 800, fontSize: 16, border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", color: "text.primary" }}>
            {t.symbol}
          </Typography>
          <Chip size="small" label={t.status === "PLANNED" ? `${t.order_kind === "LIMIT" ? "Limit" : "Buy-stop"} order` : t.status.toLowerCase()}
                sx={{ height: 22, textTransform: "capitalize" }} />
          {t.note?.startsWith("auto") && <Chip size="small" color="secondary" label="⚡ auto" sx={{ height: 22 }} />}
          <Box flexGrow={1} />
          {pnl != null && (
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontWeight: 800, color: tone(pnl) }}>{money(pnl)}</Typography>
              <Typography variant="caption" sx={{ color: tone(pnlPct) }}>{fmtPct(pnlPct, 2)}</Typography>
            </Box>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t.qty} shares
          {t.status === "PLANNED" ? ` · trigger ₹${fmt(t.trigger)}` : ` · entry ₹${fmt(t.entry_price)}`}
          {t.last_price != null && t.status === "OPEN" && ` · now ₹${fmt(t.last_price)}`}
          {` · stop ₹${fmt(t.stop)}`}
          {t.exit_price != null && ` · exit ₹${fmt(t.exit_price)}`}
        </Typography>
        {verdict && (
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            <b>{verdict.action}</b> — {verdict.why}
            {verdict.r_now != null && <Box component="span" sx={{ color: "text.secondary" }}> · {fmt(verdict.r_now)}R</Box>}
          </Typography>
        )}
        {t.exit_reason && t.status !== "OPEN" && <Typography variant="caption" color="text.secondary">{t.exit_reason}</Typography>}
        {t.note && !t.note.startsWith("auto") && (
          <Typography variant="body2" sx={{ mt: 0.75, fontStyle: "italic" }}>📝 {t.note}</Typography>
        )}
        <Collapse in={story}>
          <Box sx={{ mt: 1, pl: 1.5, borderLeft: 2, borderColor: "divider" }}>
            {t.events.map((e, i) => (
              <Typography key={i} variant="caption" sx={{ display: "block" }}>
                <b>{e.event.replace(/_/g, " ")}</b> · {e.ts}{e.price != null && ` @ ₹${fmt(e.price)}`}{e.reason && ` — ${e.reason}`}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </CardContent>
      <Stack direction="row" spacing={0.5} sx={{ px: 1, pb: 1 }} flexWrap="wrap" useFlexGap>
        <Button size="small" onClick={() => setStory((s) => !s)}>{story ? "Hide story" : `Story · ${t.events.length}`}</Button>
        {(t.status === "OPEN" || t.status === "PLANNED") && <Button size="small" onClick={() => onAction("stop")}>Move stop</Button>}
        {t.status === "OPEN" && <Button size="small" color="warning" onClick={() => onAction("exit")}>Record exit</Button>}
        {onCancel && <Button size="small" color="error" onClick={onCancel}>Cancel order</Button>}
        <Button size="small" onClick={() => onAction("note")}>{t.note && !t.note.startsWith("auto") ? "Edit note" : "Add note"}</Button>
      </Stack>
    </Card>
  );
}

function ActionDialog({ d, close, act }: { d: NonNullable<DialogState>; close: () => void; act: (fn: () => Promise<unknown>) => void }) {
  const { kind, trade } = d;
  const [stop, setStop] = useState(String(trade.stop ?? ""));
  const [price, setPrice] = useState(String(trade.last_price ?? trade.entry_price ?? ""));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(trade.note?.startsWith("auto") ? "" : (trade.note ?? ""));
  const entry = trade.entry_price;
  return (
    <Dialog open onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{kind === "stop" ? "Move stop" : kind === "exit" ? "Record exit" : "Notes & lessons"} — {trade.symbol}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {kind === "stop" && <>
            <TextField label="New stop-loss (₹)" type="number" value={stop} autoFocus onChange={(e) => setStop(e.target.value)}
                       helperText="Must stay below the entry. Every move is kept in the trade's story." />
            {entry != null && trade.status === "OPEN" && (
              <Button size="small" variant="outlined" onClick={() => setStop(String(entry))}>
                Breakeven (₹{fmt(entry)})
              </Button>
            )}
          </>}
          {kind === "exit" && <>
            <TextField label="Exit price (₹)" type="number" value={price} autoFocus onChange={(e) => setPrice(e.target.value)} />
            <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="target hit, rule exit, …" />
          </>}
          {kind === "note" && (
            <TextField label="What did this trade teach you?" value={note} autoFocus multiline minRows={4}
                       onChange={(e) => setNote(e.target.value)} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" onClick={() => {
          if (kind === "stop") return act(() => api.moveStop(trade.id, Number(stop)));
          if (kind === "exit") return act(() => api.recordExit(trade.id, Number(price), reason || "sold (paper)"));
          return act(() => api.setNote(trade.id, note));
        }}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}