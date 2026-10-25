import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, IconButton, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, DataStatus } from "../api";
import { ErrorNote, Loading, SectionTitle, Stat } from "../ui";

/** Data & jobs: is the data fresh, when does the next scan run, and the manual
 *  "update prices now" button (SEPA's Data page, minus the Dhan download). */
export default function DataPage({ onBack }: { onBack: () => void }) {
  const [d, setD] = useState<DataStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api.data().then(setD).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);

  const update = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/signals/run-daily-job", { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
      const j = await r.json();
      setMsg(`Updated ${j.symbols} stocks; scan found ${j.candidates} candidates as of ${j.asof}.`);
      load();
    } catch (e) { setErr(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={onBack} aria-label="back" edge="start"><ArrowBackIcon /></IconButton>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Data & jobs</Typography>
      </Stack>
      {err && <ErrorNote error={err} />}
      {msg && <Alert severity="success" sx={{ my: 1 }}>{msg}</Alert>}
      {!d ? <Loading /> : d.source !== "sepa" ? (
        <Alert severity="warning">The SEPA engine was not found — the app is running on mock signals.</Alert>
      ) : <>
        <SectionTitle>Prices</SectionTitle>
        <Card variant="outlined"><CardContent>
          <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
            <Stat label="Price files" value={d.price_files ?? "—"} />
            <Stat label="Last price update" value={d.prices_updated ?? "—"} />
            <Stat label="NIFTY 500 members" value={d.universe_size ?? "—"} />
          </Stack>
          <Button variant="contained" sx={{ mt: 1.5 }} onClick={update} disabled={busy}>
            {busy ? "Updating — this takes a few minutes…" : "Update prices now (Yahoo) + rescan"}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Incremental download for the NIFTY 500 into the SEPA price store, then a fresh scan. The daily job does the same automatically.
          </Typography>
        </CardContent></Card>

        <SectionTitle>Scan & jobs</SectionTitle>
        <Card variant="outlined"><CardContent>
          <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
            <Stat label="Scan as of" value={d.scan?.asof || "—"} />
            <Stat label="Scheduled at" value={d.scheduler?.scan_times?.join(", ") ?? "—"} />
            <Stat label="Last job" value={d.scheduler?.last_run || "not yet today"} />
            <Stat label="Quote poll" value={d.quote_poller?.interval_s ? `${d.quote_poller.interval_s}s` : "—"} />
            <Stat label="Last quote poll" value={d.quote_poller?.last_poll || "—"} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{d.scan?.status}</Typography>
          {d.quote_poller?.last_error && <Typography variant="caption" color="error.main">{d.quote_poller.last_error}</Typography>}
        </CardContent></Card>

        <SectionTitle>Journal storage</SectionTitle>
        <Card variant="outlined"><CardContent>
          <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
            <Stat label="Store" value={d.store ?? "—"} />
            <Stat label="Paper trades" value={d.journal_trades ?? 0} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Engine & prices: {d.sepa_root}. Back up the app's data folder to keep your journal safe.
          </Typography>
        </CardContent></Card>
      </>}
    </Box>
  );
}