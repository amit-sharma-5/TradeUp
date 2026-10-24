import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Chip, Container, Divider, Stack, Step, StepLabel,
  Stepper, Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ReplayIcon from "@mui/icons-material/Replay";
import LockIcon from "@mui/icons-material/Lock";
import { api, Health } from "../api";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d });

const LOOP = ["Signal", "Decision", "Paper order", "Outcome", "Review"];

const UNIQUE = [
  {
    icon: <AutoAwesomeIcon color="primary" />,
    title: "Your rules, verbatim",
    body: "The screener, position sizing and paper fills all run the same validated SEPA engine (Minervini's method) that was backtested on years of NSE data — imported as a library, never rewritten.",
  },
  {
    icon: <MenuBookIcon color="primary" />,
    title: "The full story of every trade",
    body: "The screener's 'why' is frozen at decision time, every fill / stop move / exit is an append-only timeline, and your notes and lessons stay with the trade.",
  },
  {
    icon: <ReplayIcon color="primary" />,
    title: "Practice that matches the plan",
    body: "Open paper orders fill from live prices using exactly the rules the backtest assumed — buy-stop, chase limit, stop-out — so practice and research never disagree.",
  },
  {
    icon: <LockIcon color="primary" />,
    title: "Private and yours",
    body: "Runs on your machine, your data in plain CSV files, no cloud, no subscription. Paper only in this phase — real orders are deliberately out of reach.",
  },
];

export default function AboutPage() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => {}); }, []);

  return (
    <Container maxWidth="sm" sx={{ mt: 2 }}>
      {/* what this is */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            TradeUp — your paper-trading terminal
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Other apps tell you what stocks look interesting. This one runs
            <b> your </b> validated system, lets you practise it with identical
            rules, and then shows the full story of every trade — why you
            entered, what happened, and what to learn.
          </Typography>
          <Stepper orientation="horizontal" alternativeLabel sx={{ mt: 2 }}
                   activeStep={LOOP.length}>
            {LOOP.map((s) => (
              <Step key={s}><StepLabel><Typography variant="caption">{s}</Typography></StepLabel></Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* what makes it different */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>
        What makes it different
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {UNIQUE.map((u) => (
          <Card key={u.title} variant="outlined">
            <CardContent sx={{ py: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                {u.icon}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{u.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{u.body}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* live status */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>
        Right now
      </Typography>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          {health ? (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined"
                      color={health.signal_source === "sepa" ? "success" : "warning"}
                      label={health.signal_source === "sepa" ? "Signals: SEPA engine" : "Signals: mock (no engine)"} />
                <Chip size="small" variant="outlined" label={`Storage: ${health.store}`} />
                <Chip size="small" variant="outlined" label={`${health.trades} paper trade${health.trades === 1 ? "" : "s"}`} />
              </Stack>
              {health.signal_source === "sepa" && (
                <Typography variant="caption" color="text.secondary">
                  {health.signals.status}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                Daily scan at {health.scheduler.scan_times.join(" + ")} · quote poll every {health.quote_poller.interval_s}s
                {health.quote_poller.last_poll && <> · last quote poll {health.quote_poller.last_poll}</>}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">Status unavailable.</Typography>
          )}
        </CardContent>
      </Card>

      {/* fine print */}
      <Divider sx={{ mb: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", pb: 2 }}>
        Paper trading only — nothing here places a real order.
        Not investment advice; a tool to practise a method and learn from every trade.
      </Typography>
    </Container>
  );
}