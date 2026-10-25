import { useEffect, useMemo, useState } from "react";
import { Box, InputAdornment, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { api, StockSymbol } from "../api";
import { Empty, ErrorNote, Loading, PageHeader } from "../ui";

/** Find any NIFTY 500 member by symbol or company name → its stock page. */
export default function SearchPage({ onStock }: { onStock: (s: string) => void }) {
  const [all, setAll] = useState<StockSymbol[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { api.symbols().then(setAll).catch((e) => setErr(String(e.message || e))); }, []);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!all) return [];
    if (!s) return [];
    return all.filter((x) => x.symbol.toLowerCase().startsWith(s)).concat(
      all.filter((x) => !x.symbol.toLowerCase().startsWith(s) &&
        (x.symbol.toLowerCase().includes(s) || x.name.toLowerCase().includes(s) || x.industry.toLowerCase().includes(s))),
    ).slice(0, 40);
  }, [all, q]);

  return (
    <Box>
      <PageHeader title="Search" subtitle="Any of the NIFTY 500 — not just today's candidates" />
      <TextField fullWidth autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Symbol, company or industry — e.g. HAL, Hindustan, Banks"
                 InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
      {err && <ErrorNote error={err} />}
      {!all && !err && <Loading />}
      {all && !q && <Box sx={{ mt: 2 }}><Empty>Start typing — {all.length} stocks searchable.</Empty></Box>}
      {all && q && hits.length === 0 && <Box sx={{ mt: 2 }}><Empty>No match for “{q}”.</Empty></Box>}
      {hits.length > 0 && (
        <List sx={{ mt: 1, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 3, py: 0 }}>
          {hits.map((s, i) => (
            <ListItemButton key={s.symbol} divider={i < hits.length - 1} onClick={() => onStock(s.symbol)}>
              <ListItemText primary={<Typography sx={{ fontWeight: 800 }}>{s.symbol}</Typography>}
                            secondary={`${s.name} · ${s.industry}`} />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}