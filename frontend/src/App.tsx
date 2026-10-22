import { useEffect, useState } from "react";
import { AppBar, Box, BottomNavigation, BottomNavigationAction, Typography, Toolbar } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CandidatesPage from "./pages/CandidatesPage";
import JournalPage from "./pages/JournalPage";

export default function App() {
  const [page, setPage] = useState<"candidates" | "journal">("candidates");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 5000); // Phase 1 polling; WS later
    return () => clearInterval(iv);
  }, []);

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" elevation={0} color="transparent" sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <TrendingUpIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700, color: "text.primary" }}>TradeUp</Typography>
        </Toolbar>
      </AppBar>

      {page === "candidates" && <CandidatesPage tick={tick} />}
      {page === "journal" && <JournalPage tick={tick} />}

      <BottomNavigation
        value={page}
        onChange={(_, v) => setPage(v)}
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0, borderTop: 1, borderColor: "divider" }}
      >
        <BottomNavigationAction label="Candidates" value="candidates" icon={<TrendingUpIcon />} />
        <BottomNavigationAction label="Journal" value="journal" icon={<ReceiptLongIcon />} />
      </BottomNavigation>
    </Box>
  );
}
