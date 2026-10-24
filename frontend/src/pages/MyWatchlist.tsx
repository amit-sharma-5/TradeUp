import { useEffect, useState } from "react";
import {
  Alert, Autocomplete, Box, Chip, IconButton, Stack, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { api, StockSymbol, WatchRow } from "../api";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

/** My Watchlist: stocks the trader is studying that the rules don't flag yet.
 *  Prices refresh with the quote poller. Adding needs the stock to be a
 *  NIFTY 500 member (same universe the engine trades). */
export default function MyWatchlist({ onChart }: { onChart?: (symbol: string) => void }) {
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [allSymbols, setAllSymbols] = useState<StockSymbol[]>([]);
  const [picked, setPicked] = useState<StockSymbol | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api.watchlist().then((d) => setRows(d.symbols)).catch((e) => setErr(String(e)));
  useEffect(() => {
    load();
    api.symbols().then(setAllSymbols).catch(() => {});
  }, []);

  const add = async () => {
    if (!picked) return;
    setErr(""); setMsg("");
    try {
      await api.addWatch(picked.symbol);
      setMsg(`${picked.symbol} added to your watchlist.`);
      setPicked(null);
      load();
    } catch (e) { setErr(String(e)); }
  };

  const remove = async (sym: string) => {
    try { await api.removeWatch(sym); load(); }
    catch (e) { setErr(String(e)); }
  };

  return (
    <Box sx={{ mt: 1 }}>
      {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 1 }}>{msg}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} alignItems="center">
        <Autocomplete
          size="small" fullWidth
          options={allSymbols}
          value={picked}
          onChange={(_, v) => setPicked(v)}
          getOptionLabel={(s) => s.symbol}
          renderOption={(props, s) => (
            <li {...props} key={s.symbol}>
              <Box>
                <Typography variant="body1">{s.symbol}</Typography>
                <Typography variant="caption" color="text.secondary">{s.name}</Typography>
              </Box>
            </li>
          )}
          filterOptions={(opts, { inputValue }) => {
            const q = inputValue.trim().toLowerCase();
            return opts.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 25);
          }}
          renderInput={(params) => <TextField {...params} placeholder="Search a stock to watch…" />}
        />
        <IconButton color="primary" onClick={add} disabled={!picked} aria-label="add to watchlist">
          <AddIcon />
        </IconButton>
      </Stack>

      {rows && rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
          Your personal list is empty — add stocks you are studying, even when the
          rules don't flag them yet. They get live prices automatically.
        </Typography>
      )}
      {rows && rows.length > 0 && (
        <Stack spacing={1}>
          {rows.map((r) => (
            <Stack key={r.symbol} direction="row" alignItems="center" spacing={1}
                   sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 1.5, py: 1, bgcolor: "background.paper" }}>
              <Box sx={{ flexGrow: 1, cursor: "pointer" }} onClick={() => onChart?.(r.symbol)}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{r.symbol}</Typography>
                <Typography variant="caption" color="text.secondary">{r.name}</Typography>
              </Box>
              {r.ltp != null && <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>₹{fmt(r.ltp)}</Typography>}
              {r.change_pct != null && (
                <Chip size="small" variant="outlined" color={r.change_pct >= 0 ? "success" : "error"}
                      label={`${r.change_pct >= 0 ? "+" : ""}${fmt(r.change_pct)}%`} />
              )}
              {onChart && <Chip size="small" label="Chart" onClick={() => onChart(r.symbol)} />}
              <IconButton size="small" onClick={() => remove(r.symbol)} aria-label={`remove ${r.symbol}`}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}