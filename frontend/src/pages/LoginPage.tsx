import { useState } from "react";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { api } from "../api";

/** Shown only when the backend has TRADEUP_PASSPHRASE set and this browser has
 *  no valid session. Localhost without a passphrase never sees this. */
export default function LoginPage({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await api.login(pass);
      onDone();
    } catch (x) {
      const m = String((x as Error).message || x);
      setErr(m.includes("too many") ? "Too many attempts — wait 10 minutes and try again." : "Wrong passphrase.");
    } finally { setBusy(false); }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2 }}>
      <Card variant="outlined" sx={{ width: "100%", maxWidth: 380 }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: "10px", bgcolor: "primary.main",
                       display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUpIcon sx={{ color: "#fff" }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>TradeUp</Typography>
              <Typography variant="caption" color="text.secondary">Sign in to your trading system</Typography>
            </Box>
          </Stack>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              <TextField type="password" label="Passphrase" value={pass} autoFocus fullWidth
                         autoComplete="current-password" onChange={(e) => setPass(e.target.value)} />
              {err && <Alert severity="error">{err}</Alert>}
              <Button type="submit" variant="contained" size="large" disabled={busy || !pass}>Sign in</Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}