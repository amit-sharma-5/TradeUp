import { useEffect, useRef, useState } from "react";
import { AppBar, Box, BottomNavigation, BottomNavigationAction, Typography, Toolbar } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CandlestickChartIcon from "@mui/icons-material/CandlestickChart";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CandidatesPage from "./pages/CandidatesPage";
import JournalPage from "./pages/JournalPage";
import ChartPage from "./pages/ChartPage";
import BacktestPage from "./pages/BacktestPage";
import AboutPage from "./pages/AboutPage";
import LoginPage from "./pages/LoginPage";
import TradePage from "./pages/TradePage";
import { api, Signal, UnauthorizedError } from "./api";

type Page = "candidates" | "journal" | "chart" | "backtest" | "about";
type View = { page: Page; chartSym: string | null; tradeSig: Signal | null };

export default function App() {
  const [view, setView] = useState<View>({ page: "candidates", chartSym: null, tradeSig: null });  const [tick, setTick] = useState(0);
  const [locked, setLocked] = useState(false);
  const stack = useRef<View[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 5000); // Phase 1 polling; WS later
    return () => clearInterval(iv);
  }, []);
  // The backend keeps /api/health open even when auth is on; a gated endpoint
  // is what actually tells us whether to show the login screen.
  useEffect(() => {
    api.candidates().catch((e) => { if (e instanceof UnauthorizedError) setLocked(true); });
  }, [tick]);

  // Android/browser back gesture: every overlay pushes a history entry, so
  // "back" unwinds overlays instead of leaving the app.
  useEffect(() => {
    const onPop = () => {
      const prev = stack.current.pop();
      if (prev) setView(prev);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (patch: Partial<View>) => {
    stack.current.push(viewRef.current);
    window.history.pushState({ tu: 1 }, "");
    setView({ ...viewRef.current, ...patch });
  };
  const back = () => {
    if (stack.current.length) window.history.back();     // the popstate handler pops
    else setView({ ...viewRef.current, chartSym: null, tradeSig: null });
  };

  if (locked) return <LoginPage onDone={() => setLocked(false)} />;
  if (view.tradeSig) return <TradePage signal={view.tradeSig} onDone={back} />;
  if (view.chartSym) {
    return <ChartPage symbol={view.chartSym} onBack={back} onTrade={(s) => go({ tradeSig: s })} />;
  }

  const { page } = view;
  const goHome = () => setView({ page: "candidates", chartSym: null, tradeSig: null });
  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" elevation={0} color="transparent"
              sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <Box onClick={goHome} aria-label="TradeUp home"
               sx={{ display: "flex", alignItems: "center", gap: 1.2, cursor: "pointer", flexGrow: 1 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: "10px", bgcolor: "primary.main",
                       display: "flex", alignItems: "center", justifyContent: "center",
                       boxShadow: "0 2px 6px rgba(26,127,55,.35)" }}>
              <TrendingUpIcon sx={{ color: "#fff", fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: "text.primary", lineHeight: 1.1 }}>
                TradeUp
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                your trading system
              </Typography>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      {page === "candidates" && <CandidatesPage tick={tick} onChart={(s) => go({ chartSym: s })} />}
      {page === "journal" && <JournalPage tick={tick} onChart={(s) => go({ chartSym: s })} />}
      {page === "chart" && <ChartPage onTrade={(s) => go({ tradeSig: s })} />}
      {page === "backtest" && <BacktestPage />}
      {page === "about" && <AboutPage />}

      <BottomNavigation
        value={page}
        onChange={(_, v) => setView({ ...viewRef.current, page: v })}
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0, borderTop: 1, borderColor: "divider" }}
      >
        <BottomNavigationAction label="Candidates" value="candidates" icon={<TrendingUpIcon />} />
        <BottomNavigationAction label="Journal" value="journal" icon={<ReceiptLongIcon />} />
        <BottomNavigationAction label="Chart" value="chart" icon={<CandlestickChartIcon />} />
        <BottomNavigationAction label="Backtest" value="backtest" icon={<QueryStatsIcon />} />
        <BottomNavigationAction label="About" value="about" icon={<InfoOutlinedIcon />} />
      </BottomNavigation>
    </Box>
  );
}