const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "../..");

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
    throw new Error("Chrome not found. Set CHROME_PATH to run browser tests.");
  }
  return executable;
}

function contentType(filename) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  }[path.extname(filename)] || "application/octet-stream";
}

async function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filename = path.resolve(ROOT, relative);
    if (!filename.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.stat(filename, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": contentType(filename) });
      fs.createReadStream(filename).pipe(response);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function plannerPage(browser, server, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const startupProblems = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      startupProblems.push(message.text());
    }
  });
  page.on("pageerror", error => startupProblems.push(error.message));
  await page.route("**/supabase-config.js", route =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.MASS_PLANNER_SUPABASE_CONFIG = null;",
    }),
  );
  await page.goto(`${server.origin}/index.html`);
  try {
    await page.waitForFunction(() =>
      !["", "Connecting…", "Loading…"].includes(
        document.querySelector("#syncStatus")?.textContent.trim() || "",
      ),
      null,
      { timeout: 5000 },
    );
  } catch (error) {
    const status = await page.locator("#syncStatus").textContent().catch(() => "");
    throw new Error(
      `Planner did not start (status: ${JSON.stringify(status)}): `
      + `${startupProblems.join(" | ") || error.message}`,
    );
  }
  return { context, page };
}

let server;
let browser;

test.before(async () => {
  server = await startServer();
  browser = await chromium.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ["--no-sandbox"],
  });
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

test("planner has no horizontal overflow at mobile and desktop widths", async () => {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    const { context, page } = await plannerPage(browser, server, viewport);
    const layout = await page.evaluate(() => ({
      innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      headerWidth: document.querySelector(".site-header")?.scrollWidth || 0,
    }));
    assert.equal(
      layout.documentWidth,
      layout.innerWidth,
      `document overflowed at ${viewport.width}px`,
    );
    assert.ok(
      layout.headerWidth <= layout.innerWidth,
      `header overflowed at ${viewport.width}px`,
    );
    await context.close();
  }
});

test("public reading, navigation, and print workflow excludes private lyrics", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  const consoleProblems = [];
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(message.text());
    }
  });
  page.on("pageerror", error => consoleProblems.push(error.message));

  await page.evaluate(() => {
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: null, isEditor: false });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({
          songs: {
            entrance: {
              id: "public-song",
              title: "Public Test Hymn",
              authors: "Test Author",
              lyrics: "PRIVATE LYRICS MUST NEVER RENDER",
            },
          },
          readingOverrides: {},
          celebrationOverride: null,
        }, {});
        return () => {};
      },
    });
    window.print = () => {};
  });

  const anchors = page.locator('#readingSummary a[href^="#reading-"]');
  assert.equal(await anchors.count(), 4);
  await anchors.first().click();
  assert.match(page.url(), /#reading-first$/);

  const beforeDate = await page.locator("#dateDisplay").textContent();
  await page.locator("#next").click();
  assert.notEqual(await page.locator("#dateDisplay").textContent(), beforeDate);
  await page.locator("#prev").click();
  assert.equal(await page.locator("#dateDisplay").textContent(), beforeDate);

  assert.equal(
    await page.getByText("PRIVATE LYRICS MUST NEVER RENDER").count(),
    0,
  );
  await page.locator("#printMusicReadings").click();
  const printText = await page.locator("#printSheet").innerText();
  assert.match(printText, /Public Test Hymn/);
  assert.match(printText, /First Reading/);
  assert.doesNotMatch(printText, /PRIVATE LYRICS MUST NEVER RENDER/);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  assert.deepEqual(consoleProblems, []);
  await context.close();
});
