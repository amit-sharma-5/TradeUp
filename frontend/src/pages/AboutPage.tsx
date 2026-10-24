import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Chip, Container, Divider, Accordion, AccordionDetails,
  AccordionSummary, Stack, Step, StepLabel, Stepper, Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ReplayIcon from "@mui/icons-material/Replay";
import LockIcon from "@mui/icons-material/Lock";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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

const FEATURES: { title: string; body: string }[] = [
  { title: "Candidates", body: "Strong Buy · Buy · Algo Watch lists from the engine, each with a plain-English 'why' — plus Uptrend, Leaders, Sell/Avoid, Earnings × Tech and market context tabs." },
  { title: "Stock search", body: "Chart tab → search any of the ~500 NIFTY members by symbol or company name." },
  { title: "Charts", body: "Daily / Weekly / D+W candlesticks with volume, MA50/200 (10/30/40-week on weekly), buy point and stop lines, breakout arrows, full-screen mode and news naming the company." },
  { title: "Paper trading", body: "Trade ticket with suggested quantity from your equity and risk; buy-stop or limit entries; orders fill, chase-cancel and stop out automatically from live prices." },
  { title: "⚡ Auto paper trading", body: "Optional: new Strong Buy / Buy candidates are paper-traded automatically using the engine's plan. Turn it on in Settings." },
  { title: "Journal", body: "Live P&L on open trades, realized P&L and a summary on closed ones, full event timeline, move stop / record exit / cancel, and notes & lessons on every trade. Export as CSV." },
  { title: "Backtest", body: "Replays the rules over years of history: win rate, expectancy, drawdown, equity curve and per-grade breakdowns — SEPA-filtered vs all-breakouts baseline." },
  { title: "Rule profiles", body: "Create named versions of the rule parameters (stop %, chase %, grade filter…) in Settings; the active profile drives the screener and any profile can be backtested." },
  { title: "My Watch", body: "Your personal list of stocks being studied, with live prices — separate from the engine's lists." },
  { title: "Alerts & data", body: "Optional Telegram alerts on fills and daily scan changes (morning/evening schedule); StockEdge fundamentals import; everything stays on your machine." },
];

const GUIDE: { q: string; a: React.ReactNode }[] = [
  {
    q: "Daily routine — how do I use this app?",
    a: (<>
      1. <b>Morning:</b> if Telegram is configured, the scan report tells you what changed overnight.
      2. <b>Review Candidates:</b> start with Strong Buy, then Buy; each card says <i>why</i> the stock is listed.
      3. <b>Check the chart</b> before anything: is price near the buy point? is the market context healthy (Signals tab)?
      4. <b>Place a paper order</b> if the setup convinces you — the ticket suggests the quantity and shows your risk.
      5. <b>Let it run:</b> fills and stop-outs happen automatically; the Journal tells the story.
      6. <b>Review:</b> closed trades → add a note or lesson. That habit is the product.
    </>),
  },
  {
    q: "What do the lists mean?",
    a: (<>
      <b>Strong Buy</b> — high-quality breakouts (early base, RS ≥ 90, high volume, strong earnings) or their pullback re-entries.
      <b>Buy</b> — other volume breakouts inside the buy zone.
      <b>Algo Watch</b> — Stage-2 uptrends near a decision point: buy-ready bases, extended breakouts, or retests.
      <b>My Watch</b> — your personal list, untouched by the rules.
      Only current NIFTY 500 members are ever listed.
    </>),
  },
  {
    q: "How do paper fills work?",
    a: (<>
      A <b>Buy-stop</b> fills when the live price reaches your trigger; if the first qualifying
      price is already more than the chase limit (default +2%) above the pivot, the order is
      cancelled instead of chasing. A <b>Limit</b> fills when price is at or below your limit.
      An open trade closes automatically when price touches your <b>stop</b>. Quotes refresh
      every ~15 seconds; prices are last-traded (Yahoo), not live ticks.
    </>),
  },
  {
    q: "What is position sizing and where do I set it?",
    a: (<>
      Settings (gear icon) → Equity, Risk % and Max position %. The ticket then suggests
      <i> quantity = equity × risk% ÷ (entry − stop)</i>, capped by the max-position rule,
      and shows +2R/+3R targets. The same math the backtest used.
    </>),
  },
  {
    q: "What are rule profiles?",
    a: (<>
      Settings → Rule profiles. A profile is a named set of rule parameters (stop %, chase %,
      minimum grade, max positions). The <b>active profile</b> changes what the screener shows;
      the Backtest tab can run any profile so you can compare v1 vs v2 on real history before
      trusting either. The trading logic itself is never rewritten.
    </>),
  },
  {
    q: "What about fundamentals and news?",
    a: (<>
      StockEdge scan exports (quarterly) feed the earnings flags — cloud-upload icon on the
      Candidates page; the 'why' lines mention EPS and quality flags once data is on file.
      News under the chart comes from reputable business newsrooms only.
    </>),
  },
  {
    q: "Where is my data? Can I lose it?",
    a: (<>
      Everything lives in the app's data folder: journal (trades + events), settings,
      watchlist, profiles. Back it up by copying that folder. Closing or restarting the app
      never loses a trade; deleting the folder does.
    </>),
  },
  {
    q: "Is this real trading?",
    a: (<>
      No — deliberately. Every order is paper. Nothing here can place a real order, and
      that stays until it is explicitly, consciously switched on much later. This is a
      practice-and-research tool, not investment advice.
    </>),
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
            TradeUp — your trading system
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

      {/* features */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>
        Features
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {FEATURES.map((f) => (
          <Stack key={f.title} direction="row" spacing={1.5} alignItems="flex-start"
                 sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 1.5, py: 1.2, bgcolor: "background.paper" }}>
            <Chip size="small" label={f.title.split(" ")[0].slice(0, 12)} variant="outlined" sx={{ mt: 0.2 }} />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{f.title}</Typography>
              <Typography variant="body2" color="text.secondary">{f.body}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>

      {/* how to use */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, ml: 1 }}>
        How to use it
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {GUIDE.map((g, i) => (
          <Accordion key={i} defaultExpanded={i === 0} disableGutters
                     sx={{ border: 1, borderColor: "divider", borderRadius: "12px !important", bgcolor: "background.paper" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{g.q}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" component="div">{g.a}</Typography>
            </AccordionDetails>
          </Accordion>
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