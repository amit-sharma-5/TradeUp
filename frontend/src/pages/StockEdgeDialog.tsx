import { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List,
  ListItem, ListItemText, Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { api, StockEdgeStatus } from "../api";

/** Quarterly chore made drag-and-drop: drop a StockEdge scan export, the app
 *  files it where the engine reads it and kicks a rescan. */
export default function StockEdgeDialog({ open, close }: { open: boolean; close: () => void }) {
  const [status, setStatus] = useState<StockEdgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.stockedge().then(setStatus).catch((e) => setErr(String(e)));
  useEffect(() => { if (open) { setMsg(""); setErr(""); load(); } }, [open]);  // eslint-disable-line

  const upload = async (f: File) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api.uploadStockedge(f);
      setMsg(`${r.saved} saved. ${r.note}`);
      load();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Import StockEdge export</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          StockEdge has no API — you export the scan in their app, then import the
          file here. It lands where the engine reads it and a rescan starts, so
          EPS/quality flags appear in the screener.
        </Typography>
        {status?.latest?.error && <Alert severity="warning" sx={{ mb: 1 }}>{status.latest.error}</Alert>}
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        {msg && <Alert severity="success" sx={{ mb: 1 }}>{msg}</Alert>}
        {status?.latest?.rows != null && (
          <Typography variant="body2" sx={{ mb: 1 }}>
            Latest export: <b>{status.latest.file}</b> — {status.latest.rows} rows,
            {" "}{status.latest.symbols ?? "?"} symbols, data to {status.latest.se_date ?? "?"}.
            <br />EPS/quality flags from this data already appear in the candidates' "why" lines.
          </Typography>
        )}
        <Box sx={{ border: 2, borderColor: "divider", borderRadius: 1, p: 2, textAlign: "center", mb: 1 }}>
          <CloudUploadIcon color="primary" />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Drop or pick the quarter's StockEdge scan export (.xlsx / .csv)
          </Typography>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden
                 onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button variant="contained" size="small" sx={{ mt: 1 }} disabled={busy}
                  onClick={() => fileRef.current?.click()}>
            {busy ? "Uploading…" : "Choose file"}
          </Button>
        </Box>
        {status && status.files.length > 0 && (
          <List dense subheader={<Typography variant="caption" color="text.secondary">Exports on file</Typography>}>
            {status.files.map((f) => (
              <ListItem key={f.name} disableGutters>
                <ListItemText primary={f.name}
                              secondary={`${f.size_kb} KB · modified ${f.modified}`} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}