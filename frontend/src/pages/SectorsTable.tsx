import { useEffect, useState } from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { api, SectorRow } from "../api";

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const retColor = (v: number | null | undefined) =>
  v == null ? "text.secondary" : v >= 1 ? "success.main" : v <= -1 ? "error.main" : "text.primary";

/** NIFTY 500 by industry: median returns, breadth, Stage-2/TT/setup shares.
 *  Answers "which pockets of the market are healthy?" before picking a stock. */
export default function SectorsTable() {
  const [rows, setRows] = useState<SectorRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api.sectors().then((d) => setRows(d.sectors)).catch((e) => setErr(String(e))); }, []);

  if (err) return <Typography variant="body2" color="error" sx={{ py: 2 }}>{err}</Typography>;
  if (!rows) return null;
  if (!rows.length) return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
      No sector data yet — the first scan fills this in.
    </Typography>
  );

  const cell = {
    fontSize: 12.5, py: 1.1, whiteSpace: "nowrap" as const,
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "background.paper" }}>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" padding="none" sx={{ minWidth: 560 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: "grey.50" }}>
              {["Industry", "N", "1D", "1W", "1M", "3M", "1Y", ">50DMA", "St 2", "TT", "Setup"].map((h) => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11, color: "text.secondary", py: 1,
                                          textAlign: h === "Industry" ? "left" : "right", whiteSpace: "nowrap" }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.industry} sx={{ "&:hover": { bgcolor: "grey.50" } }}>
                <TableCell sx={{ ...cell, fontWeight: 700 }}>{r.industry}</TableCell>
                <TableCell align="right" sx={{ ...cell, color: "text.secondary" }}>{r.stocks}</TableCell>
                {(["1D", "1W", "1M", "3M", "1Y"] as const).map((p) => (
                  <TableCell key={p} align="right" sx={{ ...cell, color: retColor(r[p]) }}>
                    {fmtPct(r[p])}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ ...cell, color: r["above50%"] < 30 ? "error.main" : "text.primary" }}>
                  {r["above50%"].toFixed(0)}%
                </TableCell>
                <TableCell align="right" sx={cell}>{r["stage2%"].toFixed(0)}%</TableCell>
                <TableCell align="right" sx={cell}>{r["tt%"].toFixed(0)}%</TableCell>
                <TableCell align="right" sx={cell}>{r["setup%"].toFixed(0)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}