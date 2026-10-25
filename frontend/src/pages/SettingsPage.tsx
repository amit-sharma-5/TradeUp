import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, IconButton, MenuItem,
  Stack, Switch, TextField, Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, DhanStatus, RuleProfile, TraderSettings } from "../api";
import { ErrorNote, Loading, SectionTitle } from "../ui";

/** Settings as a full page (not a hidden dialog): sizing, ⚡ auto paper,
 *  the active rule profile, and Dhan credentials (server-side, masked). */
export default function SettingsPage({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [s, setS] = useState<TraderSettings | null>(null);
  const [profiles, setProfiles] = useState<RuleProfile[]>([]);
  const [dhan, setDhan] = useState<DhanStatus | null>(null);
  const [cid, setCid] = useState("");
  const [tok, setTok] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    api.settings().then(setS).catch((e) => setErr(String(e.message || e)));
    api.profiles().then((p) => setProfiles(p.profiles)).catch(() => {});
    api.dhanStatus().then(setDhan).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    if (!s) return;
    setErr(""); setMsg("");
    if (!(s.equity > 0) || !(s.risk_pct > 0 && s.risk_pct <= 2.5) || !(s.max_pos_pct > 0 && s.max_pos_pct <= 100)) {
      setErr("Equity must be positive, risk between 0 and 2.5%, max position between 0 and 100%.");
      return;
    }
    try { setS(await api.saveSettings(s)); setMsg("Saved."); onSaved(); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };

  const saveDhan = async () => {
    setErr(""); setMsg("");
    try { setDhan(await api.saveDhan(cid.trim(), tok.trim())); setCid(""); setTok(""); setMsg("Dhan credentials saved on the server."); }
    catch (e) { setErr(String((e as Error).message || e)); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={onBack} aria-label="back" edge="start"><ArrowBackIcon /></IconButton>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Settings</Typography>
      </Stack>
      {err && <ErrorNote error={err} />}
      {msg && <Alert severity="success" sx={{ my: 1 }}>{msg}</Alert>}
      {!s ? <Loading /> : <>
        <SectionTitle>Position sizing</SectionTitle>
        <Card variant="outlined"><CardContent>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField label="Equity (₹)" type="number" value={s.equity} sx={{ width: 180 }}
                       onChange={(e) => setS({ ...s, equity: Number(e.target.value) })} />
            <TextField label="Risk per trade (%)" type="number" value={s.risk_pct} sx={{ width: 170 }}
                       onChange={(e) => setS({ ...s, risk_pct: Number(e.target.value) })} helperText="Wiki maximum 2.5%" />
            <TextField label="Max position (%)" type="number" value={s.max_pos_pct} sx={{ width: 170 }}
                       onChange={(e) => setS({ ...s, max_pos_pct: Number(e.target.value) })} helperText="Of equity, per stock" />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Shares = equity × risk % ÷ (entry − stop), capped by the max position — the engine's own rule.
          </Typography>
        </CardContent></Card>

        <SectionTitle>Automation</SectionTitle>
        <Card variant="outlined"><CardContent>
          <FormControlLabel control={<Switch checked={!!s.auto_paper} onChange={(e) => setS({ ...s, auto_paper: e.target.checked })} />}
            label={<Box><Typography sx={{ fontWeight: 700 }}>⚡ Auto paper trading</Typography>
              <Typography variant="body2" color="text.secondary">
                After each scan, new Strong Buy / Buy candidates get a paper buy-stop order sized by the rules above.
                Exits stay rule-driven through stops. Paper only — never real money.
              </Typography></Box>} sx={{ alignItems: "flex-start", "& .MuiSwitch-root": { mt: -0.5 } }} />
        </CardContent></Card>

        <SectionTitle>Rules</SectionTitle>
        <Card variant="outlined"><CardContent>
          <TextField select label="Active rule profile" value={s.active_profile} sx={{ minWidth: 220 }}
                     onChange={(e) => setS({ ...s, active_profile: e.target.value })}>
            {profiles.map((p) => <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>)}
          </TextField>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Create and backtest profiles in Research → Rule profiles. The active one drives Today's lists after the next scan.
          </Typography>
        </CardContent></Card>

        <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={save}>Save settings</Button>

        <SectionTitle>Dhan API (live feed — later)</SectionTitle>
        <Card variant="outlined"><CardContent>
          {dhan && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Chip size="small" color={dhan.configured ? "success" : "default"}
                    label={dhan.configured ? "configured" : "not configured"} />
              {dhan.configured && <Typography variant="body2" color="text.secondary">
                client {dhan.client_id} · token {dhan.token}
              </Typography>}
            </Stack>
          )}
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField label="Client ID" value={cid} autoComplete="off" sx={{ width: 200 }} onChange={(e) => setCid(e.target.value)} />
            <TextField label="Access token" type="password" value={tok} autoComplete="new-password" sx={{ width: 280 }}
                       onChange={(e) => setTok(e.target.value)} />
          </Stack>
          <Button variant="outlined" sx={{ mt: 1.5 }} disabled={!cid.trim() || !tok.trim()} onClick={saveDhan}>Save credentials</Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            From web.dhan.co → My Profile → DhanHQ APIs (the token lasts 24 h). Stored only on this machine in
            backend/.env, shown masked, never sent to the browser.
          </Typography>
        </CardContent></Card>
      </>}
    </Box>
  );
}