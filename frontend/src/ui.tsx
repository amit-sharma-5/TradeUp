/** Shared presentational pieces — one look across every page. */
import { ReactNode } from "react";
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

export const fmtPct = (n: number | null | undefined, d = 1, sign = true) =>
  n == null || !Number.isFinite(n) ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(d)}%`;

export const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;

export const tone = (n: number | null | undefined, band = 0) =>
  n == null ? "text.secondary" : n > band ? "success.main" : n < -band ? "error.main" : "text.primary";

/** Page title row: title, optional subtitle, actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 2 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {actions && <Stack direction="row" spacing={0.5} alignItems="center">{actions}</Stack>}
    </Stack>
  );
}

/** Section label used inside pages. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" sx={{ mt: 3, mb: 1 }}>
      <Typography variant="overline" sx={{ fontWeight: 800, color: "text.secondary", flexGrow: 1, letterSpacing: ".08em" }}>
        {children}
      </Typography>
      {right}
    </Stack>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <Stack alignItems="center" spacing={1} sx={{ py: 6 }}>
      <CircularProgress size={28} />
      {label && <Typography variant="body2" color="text.secondary">{label}</Typography>}
    </Stack>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ py: 4, px: 2, textAlign: "center", border: 1, borderStyle: "dashed", borderColor: "divider", borderRadius: 3 }}>
      <Typography variant="body2" color="text.secondary">{children}</Typography>
    </Box>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>;
}

/** A labelled number for summary strips. */
export function Stat({ label, value, color, hint }: { label: string; value: ReactNode; color?: string; hint?: string }) {
  return (
    <Box sx={{ minWidth: 92 }} title={hint}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>{label}</Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.4 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>{children}</Stack>
      </CardContent>
    </Card>
  );
}

export function RsChip({ rs }: { rs: number | null | undefined }) {
  if (rs == null) return <span>—</span>;
  const color = rs >= 90 ? "success" : rs >= 70 ? "info" : "default";
  return <Chip size="small" variant="outlined" color={color} label={`RS ${Math.round(rs)}`} sx={{ height: 22 }} />;
}

export function StageChip({ stage }: { stage: number | null | undefined }) {
  if (stage == null) return <span>—</span>;
  return <Chip size="small" variant={stage === 2 ? "filled" : "outlined"} color={stage === 2 ? "success" : "default"}
               label={`Stage ${stage}`} sx={{ height: 22 }} />;
}

/** Bordered, scroll-safe table with a sticky header and consistent cells.
 *  `cols[i].align` defaults to right for everything but the first column. */
export interface Col<T> { key: string; label: string; align?: "left" | "right" | "center"; render: (row: T) => ReactNode; hide?: boolean; width?: number }
export function DataTable<T>({ cols, rows, onRowClick, maxHeight = 520, rowKey }: {
  cols: Col<T>[]; rows: T[]; onRowClick?: (row: T) => void; maxHeight?: number; rowKey: (row: T, i: number) => string;
}) {
  const visible = cols.filter((c) => !c.hide);
  const align = (c: Col<T>, i: number) => c.align ?? (i === 0 ? "left" : "right");
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "background.paper" }}>
      <TableContainer sx={{ maxHeight }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {visible.map((c, i) => (
                <TableCell key={c.key} align={align(c, i)}
                           sx={{ bgcolor: "grey.50", fontWeight: 700, fontSize: 11.5, color: "text.secondary",
                                 whiteSpace: "nowrap", py: 1, width: c.width }}>
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, ri) => (
              <TableRow key={rowKey(r, ri)} hover={!!onRowClick} onClick={onRowClick ? () => onRowClick(r) : undefined}
                        sx={{ cursor: onRowClick ? "pointer" : "default", "&:last-child td": { borderBottom: 0 } }}>
                {visible.map((c, i) => (
                  <TableCell key={c.key} align={align(c, i)}
                             sx={{ fontSize: 13, py: 1, whiteSpace: i === 0 ? "nowrap" : "normal",
                                   fontVariantNumeric: "tabular-nums" }}>
                    {c.render(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}