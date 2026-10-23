import { useEffect, useState } from "react";
import {
  Box, Chip, Container, Stack, Tab, Tabs, Typography, Alert, Tooltip, Table,
  TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { api, Watchlists, WatchlistRow } from "../api";

const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const TABS = ["Signals", "Uptrend (no base)", "Leaders", "Sell-Avoid", "Earnings x Tech"] as const;

/** The screener's other lists — everything beyond Strong Buy / Buy / Watch. */
export default function WatchlistsSection() {
  const [wl, setWl] = useState<Watchlists | null>(null);
  const [tab, setTab] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => { api.watchlists().then(setWl).catch((e) => setErr(String(e))); }, []);

  if (err) return <Alert severity="warning" sx={{ mt: 1 }}>{err}</Alert>;
  if (!wl) return null;

  const market = wl["Market"]?.[0] ?? {};

  return (
    <Box sx={{ mb: 3 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {TABS.map((t) => (
          <Tab key={t} label={t === "Signals" ? t : `${t.split(" (")[0]} (${(wl[t] as WatchlistRow[] | undefined)?.length ?? 0})`} />
        ))}
      </Tabs>
      {tab === 0 ? null : (
        <Box sx={{ mt: 1 }}>
          {TABS[tab] === "Earnings x Tech" ? <EarningsRows rows={wl["Earnings x Tech"]} /> :
            <Rows rows={(wl as unknown as Record<string, WatchlistRow[]>)[TABS[tab]] ?? []} kind={TABS[tab]} />}
        </Box>
      )}
      {market && Object.keys(market).length > 0 && tab === 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
          {Object.entries(market).map(([k, v]) => (
            <Tooltip key={k} title="Market context — information only">
              <Chip size="small" variant="outlined" label={`${k}: ${fmt(v as number)}`} />
            </Tooltip>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function Rows({ rows, kind }: { rows: WatchlistRow[]; kind: string }) {
  if (!rows.length) return <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 1 }}>
    Nothing in {kind} today.
  </Typography>;
  return (
    <Table size="small" padding="none">
      <TableHead>
        <TableRow>
          <TableCell>Symbol</TableCell>
          <TableCell align="right">Close</TableCell>
          <TableCell align="right">RS</TableCell>
          <TableCell align="right">Stage</TableCell>
          <TableCell>{kind === "Sell-Avoid" ? "Signal" : "Setup / cycle"}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell>{r.symbol}</TableCell>
            <TableCell align="right">{fmt(r.close)}</TableCell>
            <TableCell align="right">{fmt(r.rs, 0)}</TableCell>
            <TableCell align="right">{r.stage ?? "—"}</TableCell>
            <TableCell>{r.signal ?? r.cycle ?? r.setup ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EarningsRows({ rows }: { rows: WatchlistRow[] }) {
  if (!rows.length) return <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 1 }}>
    No StockEdge data — drop the quarter's export into the SEPA data folder.
  </Typography>;
  return (
    <Table size="small" padding="none">
      <TableHead>
        <TableRow>
          <TableCell>Symbol</TableCell>
          <TableCell align="right">Close</TableCell>
          <TableCell align="right">RS</TableCell>
          <TableCell align="center">TT</TableCell>
          <TableCell>Note</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell>{r.symbol}</TableCell>
            <TableCell align="right">{fmt(r.close)}</TableCell>
            <TableCell align="right">{fmt(r.rs, 0)}</TableCell>
            <TableCell align="center">{r.tt ? "✓" : "✗"}</TableCell>
            <TableCell>{r.note ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}