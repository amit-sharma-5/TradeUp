import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1a7f37" },        // Groww-style green accent
    secondary: { main: "#f9a825" },      // amber for watch-stage highlights
    error: { main: "#d32f2f" },
    success: { main: "#1a7f37" },
    info: { main: "#1e88e5" },
    background: { default: "#f6f8f7" },  // slightly green-tinted paper
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    h6: { letterSpacing: "-0.02em" },
    subtitle1: { letterSpacing: "-0.01em" },
  },
  components: {
    MuiCard: { styleOverrides: { root: { borderRadius: 14 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 600, whiteSpace: "nowrap" } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 700 } } },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>
);
