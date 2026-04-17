const qs = (selector) => document.querySelector(selector);
const storageKey = "zeptomail-bounce-json";
const collapseKey = "zeptomail-bounce-json-collapsed";
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function showToast(message, isError = false) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.className = `toast ${isError ? "error" : ""}`;

  setTimeout(() => {
    toast.className = "toast hidden";
  }, 3000);
}

function setJsonPanelCollapsed(collapsed) {
  const panel = qs("#json-panel");
  const body = qs("#json-panel-body");
  const toggle = qs("#toggle-json-panel");

  panel.classList.toggle("collapsed", collapsed);
  body.classList.toggle("hidden", collapsed);
  toggle.textContent = collapsed ? "Expand" : "Collapse";
  localStorage.setItem(collapseKey, collapsed ? "1" : "0");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date).replace(/\./g, ":");
}

function simplifyReason(reason) {
  if (reason === "bad-mailbox") {
    return "Alamat email tidak ada / salah";
  }

  if (reason === "quota-issues") {
    return "Mailbox penuh / kuota habis";
  }

  return reason || "Tidak diketahui";
}

function detectAppName(subject) {
  const value = String(subject || "").trim();
  if (!value) {
    return "Tidak diketahui";
  }

  const bracketMatch = value.match(/^\[([^\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  const beforeColon = value.split(":")[0].trim();
  if (beforeColon && beforeColon.length <= 60) {
    return beforeColon;
  }

  const beforeBracket = value.split("[")[0].trim();
  if (beforeBracket) {
    return beforeBracket;
  }

  return value;
}

function classifyDelivery(item) {
  const delivered = Number(item.event_count?.delivered_count || 0);
  const hasBounce = (item.event_data || []).some((event) => event.object === "hardbounce");

  if (hasBounce && delivered > 0) {
    return "Terkirim parsial";
  }

  if (hasBounce && delivered === 0) {
    return "Gagal terkirim";
  }

  if (delivered > 0) {
    return "Terkirim";
  }

  return "Diproses";
}

function flattenEvents(payload) {
  const items = payload?.data?.details || [];

  return items.flatMap((item) => {
    const subject = item.email_info?.subject || "-";
    const processedTime = item.email_info?.processed_time || "-";
    const deliveredCount = Number(item.event_count?.delivered_count || 0);
    const sendStatus = classifyDelivery(item);

    return (item.event_data || []).flatMap((event) => {
      return (event.details || []).map((detail) => ({
        requestId: item.request_id,
        processedTime,
        subject,
        appName: detectAppName(subject),
        deliveredCount,
        sendStatus,
        recipient: detail.bounced_recipient || "-",
        reason: detail.reason || "-",
        reasonLabel: simplifyReason(detail.reason),
        time: detail.time || processedTime,
        diagnosticMessage: detail.diagnostic_message || "-",
        object: event.object || "-"
      }));
    });
  });
}

function buildSummary(payload, events) {
  const items = payload?.data?.details || [];
  const recipientAttempts = items.reduce((total, item) => {
    const toCount = (item.email_info?.to || []).length;
    const ccCount = (item.email_info?.cc || []).length;
    const bccCount = (item.email_info?.bcc || []).length;
    return total + toCount + ccCount + bccCount;
  }, 0);

  const failedOnly = items.filter((item) => classifyDelivery(item) === "Gagal terkirim").length;
  const partial = items.filter((item) => classifyDelivery(item) === "Terkirim parsial").length;
  const delivered = items.filter((item) => classifyDelivery(item) === "Terkirim").length;

  return [
    ["Total email", items.length],
    ["Total percobaan recipient", recipientAttempts],
    ["Event bounce", events.length],
    ["Email gagal total", failedOnly],
    ["Email gagal parsial", partial],
    ["Email tanpa bounce", delivered]
  ];
}

function groupReasons(events) {
  const map = new Map();

  events.forEach((event) => {
    const current = map.get(event.reason) || {
      reason: event.reason,
      label: event.reasonLabel,
      count: 0,
      examples: new Set()
    };

    current.count += 1;
    current.examples.add(event.recipient);
    map.set(event.reason, current);
  });

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function groupRecipients(events) {
  const map = new Map();

  events.forEach((event) => {
    const current = map.get(event.recipient) || {
      recipient: event.recipient,
      count: 0,
      reasons: new Set(),
      notes: new Set()
    };

    current.count += 1;
    current.reasons.add(event.reasonLabel);
    current.notes.add(event.diagnosticMessage);
    map.set(event.recipient, current);
  });

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function groupApps(events) {
  const map = new Map();

  events.forEach((event) => {
    const current = map.get(event.appName) || {
      appName: event.appName,
      count: 0,
      recipients: new Set(),
      reasons: new Set()
    };

    current.count += 1;
    current.recipients.add(event.recipient);
    current.reasons.add(event.reasonLabel);
    map.set(event.appName, current);
  });

  return [...map.values()].sort((a, b) => b.count - a.count);
}

function renderSummary(cards) {
  qs("#summary-cards").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="stat">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
}

function renderReasons(reasons) {
  if (!reasons.length) {
    qs("#reason-summary").className = "list-grid empty-state";
    qs("#reason-summary").textContent = "Tidak ada event bounce di data ini.";
    return;
  }

  qs("#reason-summary").className = "list-grid";
  qs("#reason-summary").innerHTML = reasons
    .map(
      (item) => `
        <article class="issue-card">
          <p>${escapeHtml(item.label)}</p>
          <strong>${escapeHtml(item.count)} kejadian</strong>
          <span>Contoh: ${escapeHtml([...item.examples].slice(0, 3).join(", "))}</span>
        </article>
      `
    )
    .join("");
}

function renderRecipients(recipients) {
  qs("#recipient-rows").innerHTML = recipients.length
    ? recipients
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.recipient)}</td>
              <td>${escapeHtml(item.count)}</td>
              <td>${escapeHtml([...item.reasons].join(", "))}</td>
              <td>${escapeHtml([...item.notes][0])}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="4" class="empty-cell">Tidak ada alamat gagal.</td></tr>';
}

function renderApps(apps) {
  if (!apps.length) {
    qs("#app-summary").className = "list-grid empty-state";
    qs("#app-summary").textContent = "Tidak ada data aplikasi.";
    return;
  }

  qs("#app-summary").className = "list-grid";
  qs("#app-summary").innerHTML = apps
    .map(
      (item) => `
        <article class="issue-card">
          <p>${escapeHtml(item.appName)}</p>
          <strong>${escapeHtml(item.count)} bounce</strong>
          <span>${escapeHtml(item.recipients.size)} recipient bermasalah</span>
          <span>${escapeHtml([...item.reasons].join(", "))}</span>
        </article>
      `
    )
    .join("");
}

function renderEvents(events) {
  if (!events.length) {
    qs("#event-rows").innerHTML =
      '<tr><td colspan="7" class="empty-cell">Tidak ada event bounce.</td></tr>';
    return;
  }

  const grouped = events.reduce((acc, event) => {
    const current = acc.get(event.appName) || [];
    current.push(event);
    acc.set(event.appName, current);
    return acc;
  }, new Map());

  qs("#event-rows").innerHTML = [...grouped.entries()]
    .map(
      ([appName, appEvents]) => `
        <tr class="group-row">
          <td colspan="7">
            ${escapeHtml(appName)} · ${escapeHtml(appEvents.length)} bounce
          </td>
        </tr>
        ${appEvents
          .map(
            (event) => `
              <tr>
                <td>${escapeHtml(event.appName)}</td>
                <td>${escapeHtml(formatDateTime(event.time))}</td>
                <td>${escapeHtml(event.subject)}</td>
                <td>${escapeHtml(event.recipient)}</td>
                <td>${escapeHtml(event.reasonLabel)}</td>
                <td>${escapeHtml(event.sendStatus)} (${escapeHtml(event.deliveredCount)} delivered)</td>
                <td>${escapeHtml(event.diagnosticMessage)}</td>
              </tr>
            `
          )
          .join("")}
      `
    )
    .join("");
}

function analyzeInput() {
  const raw = qs("#json-input").value.trim();
  if (!raw) {
    showToast("Tempel JSON terlebih dahulu.", true);
    return;
  }

  try {
    const payload = JSON.parse(raw);
    const events = flattenEvents(payload);
    const summary = buildSummary(payload, events);
    const reasons = groupReasons(events);
    const recipients = groupRecipients(events);
    const apps = groupApps(events);

    localStorage.setItem(storageKey, raw);
    setJsonPanelCollapsed(true);
    renderSummary(summary);
    renderReasons(reasons);
    renderApps(apps);
    renderRecipients(recipients);
    renderEvents(events);
    showToast("Analisis selesai.");
  } catch (error) {
    showToast(`JSON tidak valid: ${error.message}`, true);
  }
}

function bindFileInput() {
  qs("#file-input").addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    const content = await file.text();
    qs("#json-input").value = content;
    analyzeInput();
  });
}

function bindActions() {
  qs("#analyze-json").addEventListener("click", analyzeInput);
  qs("#toggle-json-panel").addEventListener("click", () => {
    const panel = qs("#json-panel");
    const collapsed = !panel.classList.contains("collapsed");
    setJsonPanelCollapsed(collapsed);
  });

  qs("#clear-json").addEventListener("click", () => {
    qs("#json-input").value = "";
    localStorage.removeItem(storageKey);
    setJsonPanelCollapsed(false);
    renderSummary([
      ["Total email", 0],
      ["Total percobaan recipient", 0],
      ["Event bounce", 0],
      ["Email gagal total", 0],
      ["Email gagal parsial", 0],
      ["Email tanpa bounce", 0]
    ]);
    renderReasons([]);
    renderApps([]);
    renderRecipients([]);
    renderEvents([]);
  });
}

function init() {
  const saved = localStorage.getItem(storageKey);
  const savedCollapsed = localStorage.getItem(collapseKey) === "1";
  if (saved) {
    qs("#json-input").value = saved;
    analyzeInput();
    setJsonPanelCollapsed(savedCollapsed || Boolean(saved.trim()));
  } else {
    setJsonPanelCollapsed(false);
    renderSummary([
      ["Total email", 0],
      ["Total percobaan recipient", 0],
      ["Event bounce", 0],
      ["Email gagal total", 0],
      ["Email gagal parsial", 0],
      ["Email tanpa bounce", 0]
    ]);
    renderApps([]);
  }

  bindActions();
  bindFileInput();
}

init();
