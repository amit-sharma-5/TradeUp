import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, Switch, TextField, Typography, FormControlLabel, MenuItem,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  api, DhanStatus, RuleProfile, RuleProfileParams, TraderSettings,
} from "../api";

/** Settings: equity/risk for sizing, ⚡ auto paper trading, rule profiles
 *  (named versions of the rule parameters), and Dhan credentials (stored
 *  server-side only, shown masked). */
export default function SettingsDialog({ open, close }: { open: boolean; close: () => void }) {
  const [s, setS] = useState<TraderSettings | null>(null);
  const [profiles, setProfiles] = useState<RuleProfile[]>([]);
  const [active, setActive] = useState("default");
  const [dhan, setDhan] = useState<DhanStatus | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    api.settings().then(setS).catch((e) => setErr(String(e)));
    api.profiles().then((d) => { setProfiles(d.profiles); setActive(d.active); }).catch(() => {});
    api.dhanStatus().then(setDhan).catch(() => {});
  };
  useEffect(() => { if (open) { setErr(""); setMsg(""); load(); } }, [open]);  // eslint-disable-line

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(""); setMsg("");
    try { await fn(); setMsg(ok); load(); } catch (e) { setErr(String(e)); }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle><Stack direction="row" alignItems="center" spacing={1}>
        <SettingsIcon color="primary" /> Settings
      </Stack></DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        {msg && <Alert severity="success" sx={{ mb: 1 }}>{msg}</Alert>}

        {s && <>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>Position sizing</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }} flexWrap="wrap" useFlexGap>
            <TextField size="small" label="Equity ₹" type="number" value={s.equity}
                       onChange={(e) => setS({ ...s, equity: Number(e.target.value) })} sx={{ width: 150 }} />
            <TextField size="small" label="Risk % / trade" type="number" value={s.risk_pct}
                       onChange={(e) => setS({ ...s, risk_pct: Number(e.target.value) })} sx={{ width: 130 }} />
            <TextField size="small" label="Max position %" type="number" value={s.max_pos_pct}
                       onChange={(e) => setS({ ...s, max_pos_pct: Number(e.target.value) })} sx={{ width: 150 }} />
          </Stack>

          <FormControlLabel control={
            <Switch checked={!!s.auto_paper} onChange={(e) => setS({ ...s, auto_paper: e.target.checked })} />
          } label={<span><b>⚡ Auto paper trading</b> — place paper orders automatically for new
            Strong Buy / Buy candidates (exits stay rule-driven via stops)</span>} />

          <Button variant="contained" size="small" sx={{ mt: 1 }}
                  onClick={() => wrap(() => api.saveSettings(s), "Settings saved.")}>
            Save settings
          </Button>
        </>}

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2">Rule profiles (versions of the rule parameters)</Typography>
        <Typography variant="caption" color="text.secondary">
          The trading rules are the imported engine; a profile is a named set of its
          thresholds. The active profile drives the screener and can be backtested.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
          <TextField size="small" select label="Active profile" value={active} sx={{ minWidth: 170 }}
                     onChange={(e) => wrap(() => api.saveSettings({ active_profile: e.target.value }),
                                            `Active profile: ${e.target.value}`)}>
            {profiles.map((p) => <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>)}
          </TextField>
          {profiles.filter((p) => p.name !== "default").map((p) => (
            <Chip key={p.name} size="small" label={`delete ${p.name}`}
                  onClick={() => wrap(() => api.deleteProfile(p.name), `${p.name} deleted`)} />
          ))}
        </Stack>
        <ProfileForm onSaved={(m) => { setMsg(m); load(); }} onError={setErr} />

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2">Dhan API (live feed — for the future intraday wiring)</Typography>
        {dhan && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {dhan.configured
            ? `Configured — client id ${dhan.client_id}, token ${dhan.token}. Stored server-side only.`
            : "Not configured. Get both from web.dhan.co → My Profile → DhanHQ APIs (token is valid 24 h)."}
        </Typography>}
        <DhanForm onSaved={(m) => { setMsg(m); load(); }} onError={setErr} />
      </DialogContent>
      <DialogActions><Button onClick={close}>Close</Button></DialogActions>
    </Dialog>
  );
}

function ProfileForm({ onSaved, onError }: { onSaved: (m: string) => void; onError: (e: string) => void }) {
  const [name, setName] = useState("");
  const [stop, setStop] = useState("7");
  const [chase, setChase] = useState("2");
  const [grade, setGrade] = useState("");
  const [maxPos, setMaxPos] = useState("8");
  const save = async () => {
    try {
      const params: RuleProfileParams = {
        stop_pct: Number(stop) || undefined,
        chase_pct: Number(chase) || undefined,
        min_grade: grade || undefined,
        max_pos: Number(maxPos) || undefined,
      };
      await api.saveProfile(name.trim(), params);
      onSaved(`Profile “${name.trim()}” saved.`);
      setName("");
    } catch (e) { onError(String(e)); }
  };
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap alignItems="center">
      <TextField size="small" label="New profile name" value={name} sx={{ width: 150 }}
                 onChange={(e) => setName(e.target.value)} placeholder="v2-tight-stop" />
      <TextField size="small" label="Stop %" type="number" value={stop} sx={{ width: 90 }}
                 onChange={(e) => setStop(e.target.value)} />
      <TextField size="small" label="Chase %" type="number" value={chase} sx={{ width: 90 }}
                 onChange={(e) => setChase(e.target.value)} />
      <TextField size="small" select label="Min grade" value={grade} sx={{ width: 110 }}
                 onChange={(e) => setGrade(e.target.value)}>
        <MenuItem value="">All</MenuItem><MenuItem value="A">A</MenuItem><MenuItem value="A+">A+</MenuItem>
      </TextField>
      <TextField size="small" label="Max pos" type="number" value={maxPos} sx={{ width: 90 }}
                 onChange={(e) => setMaxPos(e.target.value)} />
      <Button size="small" variant="outlined" disabled={!name.trim()} onClick={save}>Save profile</Button>
    </Stack>
  );
}

function DhanForm({ onSaved, onError }: { onSaved: (m: string) => void; onError: (e: string) => void }) {
  const [cid, setCid] = useState("");
  const [tok, setTok] = useState("");
  const save = async () => {
    try {
      await api.saveDhan(cid.trim(), tok.trim());
      onSaved("Dhan credentials saved (server-side only).");
      setCid(""); setTok("");
    } catch (e) { onError(String(e)); }
  };
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap alignItems="center">
      <TextField size="small" label="Client ID" value={cid} sx={{ width: 160 }}
                 onChange={(e) => setCid(e.target.value)} autoComplete="off" />
      <TextField size="small" label="Access token" value={tok} type="password" sx={{ width: 240 }}
                 onChange={(e) => setTok(e.target.value)} autoComplete="new-password" />
      <Button size="small" variant="outlined" disabled={!cid.trim() || !tok.trim()} onClick={save}>
        Save credentials
      </Button>
    </Stack>
  );
}