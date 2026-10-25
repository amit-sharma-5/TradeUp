import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar, Badge, Box, BottomNavigation, BottomNavigationAction, Divider, IconButton,
  ListItemIcon, Menu, MenuItem, Paper, Toolbar, Tooltip, Typography,
} from "@mui/material";
import TodayIcon from "@mui/icons-material/Today";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ScienceIcon from "@mui/icons-material/Science";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import StorageIcon from "@mui/icons-material/Storage";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { api, Signal, UnauthorizedError } from "./api";
import TodayPage from "./pages/TodayPage";
import MarketsPage from "./pages/MarketsPage";
import PortfolioPage from "./pages/PortfolioPage";
import ResearchPage from "./pages/ResearchPage";
import SearchPage from "./pages/SearchPage";
import StockPage from "./pages/StockPage";
import TradePage from "./pages/TradePage";
import SettingsPage from "./pages/SettingsPage";
import DataPage from "./pages/DataPage";
import AboutPage from "./pages/AboutPage";
import LoginPage from "./pages/LoginPage";
import StockEdgeDialog from "./pages/StockEdgeDialog";

type Tab = "today" | "markets" | "portfolio" | "research" | "search";
type Overlay =
  | { kind: "stock"; symbol: string }
  | { kind: "trade"; signal: Signal }
  | { kind: "settings" } | { kind: "data" } | { kind: "about" };

/** Navigation shell: five tabs, full-screen overlays on top (stock detail,
 *  trade ticket, settings…). Every overlay pushes a browser history entry so
 *  the phone's back gesture unwinds it instead of leaving the app. */
export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [stack, setStack] = useState<Overlay[]>([]);
  const [tick, setTick] = useState(0);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [seOpen, setSeOpen] = useState(false);
  const [openTrades, setOpenTrades] = useState(0);
  const depth = useRef(0);

  // auth: ask the server directly instead of probing a data endpoint
  const checkSession = useCallback(() => {
    api.session().then((s) => setLocked(s.auth_enabled && !s.authenticated)).catch(() => setLocked(false));
  }, []);
  useEffect(checkSession, [checkSession]);

  // light polling: pages re-fetch on tick; pause while the tab is hidden
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, 10000);
    return () => clearInterval(iv);
  }, []);

  // badge: active paper trades
  useEffect(() => {
    if (locked) return;
    api.journal()
      .then((d) => setOpenTrades(d.trades.filter((t) => t.status === "OPEN" || t.status === "PLANNED").length))
      .catch((e) => { if (e instanceof UnauthorizedError) setLocked(true); });
  }, [tick, locked]);

  useEffect(() => {
    const onPop = () => {
      if (depth.current > 0) {
        depth.current -= 1;
        setStack((s) => s.slice(0, -1));
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = (o: Overlay) => {
    depth.current += 1;
    window.history.pushState({ tu: depth.current }, "");
    setStack((s) => [...s, o]);
  };
  const back = () => { if (depth.current > 0) window.history.back(); };
  const home = () => {
    if (depth.current > 0) window.history.go(-depth.current);   // popstate drains the stack
    setTab("today");
  };
  const openStock = (symbol: string) => open({ kind: "stock", symbol });
  const openTrade = (signal: Signal) => open({ kind: "trade", signal });
  const refreshAll = () => setTick((t) => t + 1);

  if (locked === null) return null;
  if (locked) return <LoginPage onDone={() => { setLocked(false); refreshAll(); }} />;

  const top = stack[stack.length - 1];

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 9 }}>
      <AppBar position="sticky" elevation={0} color="inherit"
              sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 0.5 }}>
          <Box onClick={home} role="button" aria-label="TradeUp home"
               sx={{ display: "flex", alignItems: "center", gap: 1.2, cursor: "pointer", flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: "10px", bgcolor: "primary.main", flexShrink: 0,
                       display: "flex", alignItems: "center", justifyContent: "center",
                       boxShadow: "0 2px 6px rgba(26,127,55,.35)" }}>
              <TrendingUpIcon sx={{ color: "#fff", fontSize: 22 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>TradeUp</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", lineHeight: 1 }}>
                your trading system
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Settings — sizing, ⚡ auto paper, rule profiles, Dhan">
            <IconButton onClick={() => open({ kind: "settings" })} aria-label="settings"><SettingsIcon /></IconButton>
          </Tooltip>
          <IconButton onClick={(e) => setMenuEl(e.currentTarget)} aria-label="more"><MoreVertIcon /></IconButton>
          <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
            <MenuItem onClick={() => { setMenuEl(null); setSeOpen(true); }}>
              <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>Import StockEdge export
            </MenuItem>
            <MenuItem onClick={() => { setMenuEl(null); open({ kind: "data" }); }}>
              <ListItemIcon><StorageIcon fontSize="small" /></ListItemIcon>Data & jobs
            </MenuItem>
            <MenuItem onClick={() => { setMenuEl(null); open({ kind: "about" }); }}>
              <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>About & guide
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setMenuEl(null); api.logout().finally(checkSession); }}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 920, mx: "auto", px: { xs: 1.5, sm: 3 }, pt: 2 }}>
        {top ? (
          <>
            {top.kind === "stock" && <StockPage symbol={top.symbol} onBack={back} onTrade={openTrade} tick={tick} />}
            {top.kind === "trade" && <TradePage signal={top.signal} onDone={back} />}
            {top.kind === "settings" && <SettingsPage onBack={back} onSaved={refreshAll} />}
            {top.kind === "data" && <DataPage onBack={back} />}
            {top.kind === "about" && <AboutPage onBack={back} />}
          </>
        ) : (
          <>
            {tab === "today" && <TodayPage tick={tick} onStock={openStock} onTrade={openTrade} onRefreshed={refreshAll} />}
            {tab === "markets" && <MarketsPage tick={tick} onStock={openStock} />}
            {tab === "portfolio" && <PortfolioPage tick={tick} onStock={openStock} />}
            {tab === "research" && <ResearchPage onStock={openStock} />}
            {tab === "search" && <SearchPage onStock={openStock} />}
          </>
        )}
      </Box>

      {!top && (
        <Paper elevation={0} sx={{ position: "fixed", bottom: 0, left: 0, right: 0, borderTop: 1, borderColor: "divider", zIndex: 10 }}>
          <BottomNavigation showLabels value={tab} onChange={(_, v) => setTab(v)}>
            <BottomNavigationAction label="Today" value="today" icon={<TodayIcon />} />
            <BottomNavigationAction label="Markets" value="markets" icon={<ShowChartIcon />} />
            <BottomNavigationAction label="Portfolio" value="portfolio"
              icon={<Badge color="primary" badgeContent={openTrades} max={99}><AccountBalanceWalletIcon /></Badge>} />
            <BottomNavigationAction label="Research" value="research" icon={<ScienceIcon />} />
            <BottomNavigationAction label="Search" value="search" icon={<SearchIcon />} />
          </BottomNavigation>
        </Paper>
      )}

      {seOpen && <StockEdgeDialog open={seOpen} close={() => { setSeOpen(false); refreshAll(); }} />}
    </Box>
  );
}