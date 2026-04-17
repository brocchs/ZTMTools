const crypto = require("crypto");
const {
  appendHistory,
  getConfig,
  getHistory,
  getStatus,
  hasStorageState,
  saveStatus
} = require("./storage");
const { fetchTargetPage } = require("./zeptomail");

let timer = null;

function getState() {
  return {
    config: getConfig(),
    history: getHistory(),
    status: {
      ...getStatus(),
      isAuthenticated: hasStorageState(),
      isPolling: Boolean(timer)
    }
  };
}

async function runMonitorOnce() {
  const config = getConfig();

  saveStatus({
    isPolling: Boolean(timer),
    lastCheckedAt: new Date().toISOString(),
    lastError: null
  });

  try {
    const result = await fetchTargetPage(config.targetUrl);
    const snapshot = {
      id: crypto.randomUUID(),
      ...result
    };

    appendHistory(snapshot);
    saveStatus({
      isAuthenticated: true,
      isPolling: Boolean(timer),
      lastSuccessAt: snapshot.capturedAt,
      lastError: null,
      lastSnapshotId: snapshot.id
    });

    return snapshot;
  } catch (error) {
    saveStatus({
      isAuthenticated: false,
      isPolling: Boolean(timer),
      lastError: error.message
    });
    throw error;
  }
}

function startPolling() {
  const config = getConfig();
  const intervalMs = Math.max(1, Number(config.pollMinutes) || 5) * 60 * 1000;

  stopPolling();
  timer = setInterval(() => {
    runMonitorOnce().catch(() => {});
  }, intervalMs);

  saveStatus({ isPolling: true });
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  saveStatus({ isPolling: false });
}

module.exports = {
  getState,
  runMonitorOnce,
  startPolling,
  stopPolling
};
