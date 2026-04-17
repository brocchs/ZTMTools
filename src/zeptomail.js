const { chromium } = require("playwright");
const cheerio = require("cheerio");
const { hasStorageState, statePath } = require("./storage");

let authBrowser = null;
let authContext = null;
let authPage = null;

function buildPreviewText($) {
  const raw = $("body").text().replace(/\s+/g, " ").trim();
  return raw.slice(0, 1500);
}

function extractTables($) {
  const tables = [];

  $("table").each((tableIndex, tableElement) => {
    const rows = [];

    $(tableElement)
      .find("tr")
      .each((rowIndex, rowElement) => {
        const cells = [];

        $(rowElement)
          .find("th, td")
          .each((cellIndex, cellElement) => {
            const value = $(cellElement).text().replace(/\s+/g, " ").trim();
            cells.push(value);
          });

        if (cells.length > 0) {
          rows.push(cells);
        }
      });

    if (rows.length > 0) {
      tables.push({
        index: tableIndex,
        rows: rows.slice(0, 30)
      });
    }
  });

  return tables.slice(0, 10);
}

async function startInteractiveLogin(targetUrl, loginUrl) {
  if (authBrowser) {
    return { ok: true, message: "Login browser sudah terbuka." };
  }

  authBrowser = await chromium.launch({ headless: false });
  authContext = await authBrowser.newContext();
  authPage = await authContext.newPage();
  await authPage.goto(loginUrl, { waitUntil: "domcontentloaded" });

  return {
    ok: true,
    message: "Browser login dibuka. Login manual di browser tersebut, lalu klik tombol simpan sesi di dashboard."
  };
}

async function finalizeInteractiveLogin() {
  if (!authContext) {
    throw new Error("Browser login belum dibuka.");
  }

  await authContext.storageState({ path: statePath });
  const pageUrl = authPage ? authPage.url() : null;
  await authBrowser.close();
  authBrowser = null;
  authContext = null;
  authPage = null;

  return {
    ok: true,
    pageUrl
  };
}

async function closeInteractiveLogin() {
  if (!authBrowser) {
    return;
  }

  await authBrowser.close();
  authBrowser = null;
  authContext = null;
  authPage = null;
}

async function importSessionFromChrome(targetUrl, debugUrl) {
  if (!debugUrl) {
    throw new Error("Debug URL Chrome belum diatur.");
  }

  const browser = await chromium.connectOverCDP(debugUrl);

  try {
    const contexts = browser.contexts();
    const context = contexts[0];

    if (!context) {
      throw new Error("Chrome terhubung, tetapi belum ada context yang bisa dipakai.");
    }

    const pages = context.pages();
    const existingTarget = pages.find((page) => page.url().startsWith("https://zeptomail.zoho.com/"));
    const page = existingTarget || (await context.newPage());

    if (targetUrl && !existingTarget) {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    }

    await context.storageState({ path: statePath });

    return {
      ok: true,
      pageUrl: page.url()
    };
  } finally {
    await browser.close();
  }
}

async function fetchTargetPage(targetUrl) {
  if (!targetUrl) {
    throw new Error("Target URL belum diatur.");
  }

  if (!hasStorageState()) {
    throw new Error("Sesi login belum tersedia.");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();

  try {
    const response = await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 90000 });
    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();
    const $ = cheerio.load(html);
    const isRelogin =
      finalUrl.startsWith("https://accounts.zoho.com/account/v1/relogin") ||
      title.toLowerCase().includes("zoho accounts");

    if (isRelogin) {
      throw new Error(
        "Akses ke URL target dialihkan ke halaman login Zoho. Biasanya ini berarti sesi ZeptoMail belum valid untuk URL tersebut atau mailagent_key pada URL sudah tidak berlaku."
      );
    }

    const tables = extractTables($);
    const previewText = buildPreviewText($);

    return {
      requestedUrl: targetUrl,
      finalUrl,
      title,
      httpStatus: response ? response.status() : null,
      capturedAt: new Date().toISOString(),
      previewText,
      tables,
      html
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  closeInteractiveLogin,
  fetchTargetPage,
  finalizeInteractiveLogin,
  importSessionFromChrome,
  startInteractiveLogin
};
