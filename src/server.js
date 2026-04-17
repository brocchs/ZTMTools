const express = require("express");
const path = require("path");
const { getState, runMonitorOnce, startPolling, stopPolling } = require("./monitor");
const { getConfig, saveConfig, saveStatus, hasStorageState } = require("./storage");
const {
  closeInteractiveLogin,
  finalizeInteractiveLogin,
  importSessionFromChrome,
  startInteractiveLogin
} = require("./zeptomail");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

app.use(express.json());
app.use(express.static(path.resolve(__dirname, "..", "public")));

app.get("/api/state", (req, res) => {
  res.json(getState());
});

app.post("/api/config", (req, res) => {
  const current = getConfig();
  const nextConfig = {
    ...current,
    targetUrl: String(req.body.targetUrl || current.targetUrl || "").trim(),
    loginUrl: String(req.body.loginUrl || current.loginUrl || "").trim(),
    debugUrl: String(req.body.debugUrl || current.debugUrl || "").trim(),
    pollMinutes: Number(req.body.pollMinutes || current.pollMinutes || 5),
    maxHistory: Number(req.body.maxHistory || current.maxHistory || 100)
  };

  saveConfig(nextConfig);
  res.json({ ok: true, config: nextConfig });
});

app.post("/api/auth/start", async (req, res) => {
  try {
    const config = getConfig();
    const result = await startInteractiveLogin(config.targetUrl, config.loginUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/finalize", async (req, res) => {
  try {
    const result = await finalizeInteractiveLogin();
    saveStatus({ isAuthenticated: hasStorageState(), lastError: null });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/import-chrome", async (req, res) => {
  try {
    const config = getConfig();
    const result = await importSessionFromChrome(config.targetUrl, config.debugUrl);
    saveStatus({ isAuthenticated: hasStorageState(), lastError: null });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/cancel", async (req, res) => {
  await closeInteractiveLogin();
  res.json({ ok: true });
});

app.post("/api/monitor/run", async (req, res) => {
  try {
    const snapshot = await runMonitorOnce();
    res.json({ ok: true, snapshot });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/monitor/start", (req, res) => {
  startPolling();
  res.json({ ok: true });
});

app.post("/api/monitor/stop", (req, res) => {
  stopPolling();
  res.json({ ok: true });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "public", "index.html"));
});

app.listen(port, host, () => {
  console.log(`ZeptoMail monitor running at http://localhost:${port}`);
  console.log(`LAN access enabled at http://<your-local-ip>:${port}`);
});
