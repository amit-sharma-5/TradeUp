import { useEffect, useState } from "react";
import {
  Box, Chip, Container, Stack, Tab, Tabs, Typography, Alert, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
} from "@mui/material";
import { api, Watchlists, WatchlistRow } from "../api";

const fmt = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const TABS = ["Signals", "Uptrend (no base)", "Leaders", "Sell-Avoid", "Earnings x Tech"] as const;
const LABEL: Record<string, string> = {
  "Uptrend (no base)": "Uptrend",
  "Sell-Avoid": "Sell / Avoid",
  "Earnings x Tech": "Earnings × Tech",
};

const headCell = {
  bgcolor: "grey.50", fontWeight: 700, fontSize: 11, color: "text.secondary",
  py: 1, whiteSpace: "nowrap" as const,
};
const numCell = {
  fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const, py: 1.1,
};
const txtCell = { fontSize: 13, py: 1.1 };

function RsChip({ rs }: { rs: number | null | undefined }) {
  if (rs == null) return <span>—</span>;
  const color = rs >= 90 ? "success" : rs >= 70 ? "primary" : "default";
  return <Chip size="small" variant="outlined" color={color} label={fmt(rs, 0)}
               sx={{ height: 22, fontSize: 12, minWidth: 38 }} />;
}

function StageChip({ stage }: { stage: number | null | undefined }) {
  if (stage == null) return <span>—</span>;
  return <Chip size="small" variant="outlined"
               color={stage === 2 ? "success" : "default"}
               label={`St ${stage}`} sx={{ height: 22, fontSize: 12 }} />;
}

/** The screener's other lists — Uptrend, Leaders, Sell/Avoid, Earnings × Tech. */
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
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
            sx={{ mb: 1.5, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}>
        {TABS.map((t) => {
          const count = t === "Signals" ? null : ((wl as unknown as Record<string, WatchlistRow[]>)[t] ?? []).length;
          return <Tab key={t} label={count == null ? t : `${LABEL[t] ?? t} · ${count}`} />;
        })}
      </Tabs>
      {tab === 0 ? (
        market && Object.keys(market).length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {Object.entries(market).map(([k, v]) => (
              <Chip key={k} size="small" variant="outlined"
                    label={`${k}: ${fmt(v as number)}`}
                    color={String(k).includes("%") && typeof v === "number" && v < 30 ? "warning" : "default"} />
            ))}
          </Stack>
        )
      ) : (
        <RowsFor tab={TABS[tab]} rows={(wl as unknown as Record<string, WatchlistRow[]>)[TABS[tab]] ?? []} />
      )}
    </Box>
  );
}

function RowsFor({ tab, rows }: { tab: string; rows: WatchlistRow[] }) {
  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
        {tab === "Earnings x Tech"
          ? "No StockEdge data on file — import the quarter's export (cloud icon above)."
          : `Nothing in ${LABEL[tab] ?? tab} today.`}
      </Typography>
    );
  }

  if (tab === "Earnings x Tech") {
    return (
      <Frame>
        <Table size="small">
          <Head cols={["Symbol", "Close", "RS", "TT", "Note"]} />
          <TableBody>
            {rows.map((r, i) => (
              <Row key={i} cells={[
                <b key="s">{r.symbol}</b>,
                <span key="c">₹{fmt(r.close)}</span>,
                <RsChip key="r" rs={r.rs} />,
                r.tt ? <Chip key="t" size="small" color="success" variant="outlined" label="✓" sx={{ height: 22, minWidth: 30, fontSize: 12 }} />
                     : <span key="t">✗</span>,
                <span key="n" style={{ color: "var(--text-secondary, #777)" }}>{r.note ?? ""}</span>,
              ]} />
            ))}
          </TableBody>
        </Table>
      </Frame>
    );
  }

  return (
    <Frame>
      <Table size="small">
        <Head cols={["Symbol", "Close", "RS", "Stage", tab === "Sell-Avoid" ? "Signal" : "Setup"]} />
        <TableBody>
          {rows.map((r, i) => (
            <Row key={i} cells={[
              <b key="s">{r.symbol}</b>,
              <span key="c">₹{fmt(r.close)}</span>,
              <RsChip key="r" rs={r.rs} />,
              <StageChip key="g" stage={r.stage} />,
              <span key="x" style={tab === "Sell-Avoid" ? { color: "#c62828" } : undefined}>
                {r.signal ?? r.cycle ?? r.setup ?? "—"}
              </span>,
            ]} />
          ))}
        </TableBody>
      </Table>
    </Frame>
  );
}

/* shared chrome */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "background.paper" }}>
      <TableContainer sx={{ maxHeight: 420 }}>
        {children}
      </TableContainer>
    </Box>
  );
}

function Head({ cols }: { cols: string[] }) {
  return (
    <TableHead>
      <TableRow>
        {cols.map((c, i) => (
          <TableCell key={c} sx={{ ...headCell, textAlign: i >= 1 && i <= 3 ? "right" : "left" }}>{c}</TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

function Row({ cells }: { cells: React.ReactNode[] }) {
  return (
    <TableRow sx={{ "&:hover": { bgcolor: "grey.50" } }}>
      {cells.map((c, i) => (
        <TableCell key={i} sx={i >= 1 && i <= 3 ? numCell : txtCell}
                   align={i >= 1 && i <= 3 ? "right" : "left"}>
          {c}
        </TableCell>
      ))}
    </TableRow>
  );
}