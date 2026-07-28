const fs = require("node:fs");
const { chromium } = require("playwright-core");

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) {
    throw new Error("Chrome not found. Set CHROME_PATH to run the production smoke test.");
  }
  return executable;
}

function recordProblems(page, problems, supabaseRequests) {
  page.on("console", message => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => problems.push(`page: ${error.message}`));
  page.on("requestfailed", request => {
    problems.push(`request: ${request.url()} (${request.failure()?.errorText || "failed"})`);
  });
  page.on("response", response => {
    const url = response.url();
    if (!url.includes(".supabase.co/")) return;
    supabaseRequests.push(decodeURIComponent(url));
    if (response.status() >= 400) {
      problems.push(`Supabase: ${response.status()} ${url}`);
    }
  });
}

async function waitForText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: target, expected: text }) =>
      document.querySelector(target)?.textContent.trim() === text,
    { selector, expected },
    { timeout: 15000 },
  );
}

async function smokeBrowser({
  siteUrl = process.env.SITE_URL || "https://tow.github.io/sundaymass/",
  sunday = process.env.SMOKE_SUNDAY || "2026-08-02",
} = {}) {
  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const problems = [];
  const supabaseRequests = [];
  try {
    const planner = await context.newPage();
    recordProblems(planner, problems, supabaseRequests);
    const plannerUrl = new URL(siteUrl);
    plannerUrl.searchParams.set("date", sunday);
    plannerUrl.searchParams.set("smoke", Date.now().toString());
    const plannerResponse = await planner.goto(plannerUrl.href, { waitUntil: "domcontentloaded" });
    if (!plannerResponse?.ok()) {
      problems.push(`planner: HTTP ${plannerResponse?.status() || "no response"}`);
    }
    await waitForText(planner, "#syncStatus", "Up to date");
    const musicRows = await planner.locator(".music-view-row").count();
    if (musicRows !== 14) problems.push(`planner: expected 14 music rows, found ${musicRows}`);
    const listenLinks = await planner.getByRole("link", { name: /Listen/ }).count();
    if (listenLinks === 0) problems.push(`planner: ${sunday} has no listening links`);
    if (await planner.locator("[data-edit-song]:visible").count()) {
      problems.push("planner: anonymous visitor can see song editing controls");
    }

    const repertoire = await context.newPage();
    recordProblems(repertoire, problems, supabaseRequests);
    const repertoireUrl = new URL("repertoire.html", siteUrl);
    repertoireUrl.searchParams.set("smoke", Date.now().toString());
    const repertoireResponse = await repertoire.goto(
      repertoireUrl.href,
      { waitUntil: "domcontentloaded" },
    );
    if (!repertoireResponse?.ok()) {
      problems.push(`repertoire: HTTP ${repertoireResponse?.status() || "no response"}`);
    }
    await waitForText(repertoire, "#repertoireStatus", "Up to date");
    const songCards = await repertoire.locator(".song-card").count();
    if (songCards === 0) problems.push("repertoire: no public songs rendered");
    if (await repertoire.locator("[data-edit-song]:visible").count()) {
      problems.push("repertoire: anonymous visitor can see song editing controls");
    }
    if (await repertoire.locator("#songLyrics:visible").count()) {
      problems.push("repertoire: anonymous visitor can see the private lyrics field");
    }
    if (supabaseRequests.some(url => /\bsong_lyrics\b|\blyrics\b/i.test(url))) {
      problems.push("browser: an anonymous Supabase request asked for private lyrics");
    }
    if (!supabaseRequests.some(url => url.includes("/rest/v1/plans"))) {
      problems.push("browser: planner made no public plan request");
    }
    if (!supabaseRequests.some(url => url.includes("/rest/v1/songs"))) {
      problems.push("browser: repertoire made no public songs request");
    }
    if (problems.length) throw new Error(problems.join("\n"));
    console.log(
      `production browser smoke passed (${musicRows} music rows, `
      + `${listenLinks} listening links, ${songCards} repertoire songs)`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

if (require.main === module) {
  smokeBrowser().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { chromeExecutable, smokeBrowser };
