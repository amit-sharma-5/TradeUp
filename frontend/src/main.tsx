import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1a7f37" },        // Groww-style green accent
    error: { main: "#d32f2f" },
    background: { default: "#fafafa" },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: "Inter, system-ui, sans-serif" },
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
