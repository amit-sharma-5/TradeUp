import { useState } from "react";
import { Alert, Box, Button, Container, Stack, TextField, Typography } from "@mui/material";
import { api } from "../api";

/** Shown only when the backend has TRADEUP_PASSPHRASE set and the session
 *  cookie is missing/expired. Localhost without a passphrase never sees this. */
export default function LoginPage({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await api.login(pass);
      onDone();
    } catch {
      setErr("Wrong passphrase. It is set in the backend's TRADEUP_PASSPHRASE.");
    }
  };

  return (
    <Container maxWidth="xs" sx={{ mt: 10 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Sign in to TradeUp</Typography>
      <form onSubmit={submit}>
        <Stack spacing={2}>
          <TextField type="password" label="Passphrase" value={pass} autoFocus
                     onChange={(e) => setPass(e.target.value)} fullWidth />
          {err && <Alert severity="error">{err}</Alert>}
          <Button type="submit" variant="contained">Sign in</Button>
        </Stack>
      </form>
    </Container>
  );
}