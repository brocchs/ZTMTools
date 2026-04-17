const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "..", "data");
const configPath = path.join(dataDir, "config.json");
const historyPath = path.join(dataDir, "history.json");
const statusPath = path.join(dataDir, "status.json");
const statePath = path.join(dataDir, "storage-state.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function defaultConfig() {
  return {
    targetUrl: "",
    pollMinutes: 5,
    maxHistory: 100,
    loginUrl: "https://accounts.zoho.com/signin?servicename=ZeptoMail",
    debugUrl: "http://127.0.0.1:9222"
  };
}

function getConfig() {
  return { ...defaultConfig(), ...readJson(configPath, {}) };
}

function saveConfig(nextConfig) {
  writeJson(configPath, { ...defaultConfig(), ...nextConfig });
}

function getHistory() {
  return readJson(historyPath, []);
}

function appendHistory(entry) {
  const config = getConfig();
  const history = getHistory();
  history.unshift(entry);
  writeJson(historyPath, history.slice(0, config.maxHistory));
}

function getStatus() {
  return readJson(statusPath, {
    isAuthenticated: false,
    isPolling: false,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastSnapshotId: null
  });
}

function saveStatus(status) {
  writeJson(statusPath, { ...getStatus(), ...status });
}

function hasStorageState() {
  return fs.existsSync(statePath);
}

module.exports = {
  appendHistory,
  configPath,
  defaultConfig,
  ensureDataDir,
  getConfig,
  getHistory,
  getStatus,
  hasStorageState,
  saveConfig,
  saveStatus,
  statePath
};
