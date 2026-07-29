const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright-core");
const JSZip = require("jszip");

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
  await page.route("**/supabase-config.js*", route =>
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

async function repertoirePage(browser, server, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("st-james-song-catalog-v1", JSON.stringify([
      {
        id: "repertoire-city",
        title: "City of God",
        authors: "Dan Schutte",
        inRepertoire: true,
      },
      {
        id: "library-city",
        title: "City of Hope",
        authors: "Guest Composer",
        inRepertoire: false,
      },
      {
        id: "library-bread",
        title: "Bread for the World",
        authors: "Guest Composer",
        inRepertoire: false,
      },
    ]));
  });
  const page = await context.newPage();
  await page.route("**/supabase-config.js*", route =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.MASS_PLANNER_SUPABASE_CONFIG = null;",
    }),
  );
  await page.goto(`${server.origin}/repertoire.html`);
  await page.waitForFunction(() =>
    document.querySelector("#repertoireStatus")?.textContent === "Up to date",
  );
  return { context, page };
}

function pdfPageGeometry(pdf) {
  const source = pdf.toString("latin1");
  const boxes = [...source.matchAll(
    /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g,
  )].map(match => ({
    width: Number(match[1]),
    height: Number(match[2]),
  }));
  return {
    boxes,
    pageCount: (source.match(/\/Type\s*\/Page\b/g) || []).length,
  };
}

function assertA4Pages(pdf, minimumPages) {
  const geometry = pdfPageGeometry(pdf);
  assert.ok(geometry.pageCount >= minimumPages);
  assert.ok(geometry.boxes.length >= minimumPages);
  geometry.boxes.forEach(({ width, height }) => {
    assert.ok(Math.abs(width - 595.28) < 2, `unexpected PDF width ${width}`);
    assert.ok(Math.abs(height - 841.89) < 2, `unexpected PDF height ${height}`);
  });
  return geometry.pageCount;
}

function assertA4LandscapePages(pdf, expectedPages) {
  const geometry = pdfPageGeometry(pdf);
  assert.equal(geometry.pageCount, expectedPages);
  assert.equal(geometry.boxes.length, expectedPages);
  geometry.boxes.forEach(({ width, height }) => {
    assert.ok(Math.abs(width - 841.89) < 2, `unexpected PDF width ${width}`);
    assert.ok(Math.abs(height - 595.28) < 2, `unexpected PDF height ${height}`);
  });
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

test(
  "configured monitoring forwards errors without user, request, or breadcrumb data",
  { timeout: 10000 },
  async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  let resolveEventEnvelope;
  let resolveLogEnvelope;
  const eventEnvelopeReceived = new Promise(resolve => {
    resolveEventEnvelope = resolve;
  });
  const logEnvelopeReceived = new Promise(resolve => {
    resolveLogEnvelope = resolve;
  });
  await context.route("https://example.com/**", async route => {
    const body = route.request().postData() || "";
    if (body.includes("Monitoring pipeline test")) resolveEventEnvelope(body);
    if (body.includes("Monitoring warning test")) resolveLogEnvelope(body);
    await route.fulfill({ status: 200, body: "{}" });
  });
  const page = await context.newPage();
  await page.route("**/supabase-config.js*", route =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.MASS_PLANNER_SUPABASE_CONFIG = null;
        window.MASS_PLANNER_MONITORING_CONFIG = {
          dsn: "https://public@example.com/1",
          environment: "test"
        };
      `,
    }),
  );
  await page.goto(`${server.origin}/index.html`);
  await page.evaluate(() => {
    AppLogger.error("Monitoring pipeline test", new Error("Test exception"));
    AppLogger.warn("Monitoring warning test");
  });

  const [eventEnvelope, logEnvelope] = await Promise.all([
    eventEnvelopeReceived,
    logEnvelopeReceived,
  ]);
  const event = JSON.parse(eventEnvelope.trim().split("\n").at(-1));
  assert.equal(event.environment, "test");
  assert.equal(event.tags.app_surface, "planner");
  assert.equal(typeof event.tags.app_build, "string");
  assert.equal(event.user, undefined);
  assert.equal(event.request, undefined);
  assert.equal(event.breadcrumbs, undefined);
  assert.match(logEnvelope, /Monitoring warning test/);
  assert.match(logEnvelope, /app_surface/);
  assert.match(logEnvelope, /app_build/);
  assert.doesNotMatch(logEnvelope, /user\.(?:id|email|name)/);
    await context.close();
  },
);

test("music header omits redundant mobile copy", async () => {
  const mobile = await plannerPage(browser, server, { width: 390, height: 844 });
  assert.equal(await mobile.page.locator(".music-head .eyebrow").count(), 0);
  assert.equal(await mobile.page.locator("#musicIntro").isVisible(), false);
  await mobile.context.close();

  const desktop = await plannerPage(browser, server, { width: 1280, height: 900 });
  assert.equal(await desktop.page.locator("#musicIntro").isVisible(), true);
  await desktop.context.close();
});

test("logged-out users can browse suggestions for an empty slot without editing", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    window.__publicSuggestionCalls = [];
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: null, isEditor: false });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs: {}, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      suggestSongs(citations, part) {
        window.__publicSuggestionCalls.push({ citations, part });
        return Promise.resolve([
          {
            id: "public-1",
            title: "Bread of Life",
            authors: "Composer One",
            youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
          },
          {
            id: "public-2",
            title: "One Bread",
            authors: "Composer Two",
            youtubeUrl: "https://example.com/not-youtube",
          },
        ]);
      },
      assignSong() {
        throw new Error("A logged-out user must not assign a song");
      },
    });
  });

  const launch = page.locator(
    'button[data-song-action="suggestions"][data-part="communion"]',
  );
  await launch.scrollIntoViewIfNeeded();
  await launch.click();

  const dialog = page.locator("#songPickerDialog");
  await assert.doesNotReject(() => dialog.waitFor({ state: "visible" }));
  assert.equal(await page.locator("#songPickerTitle").textContent(), "Suggestions for Communion 1");
  assert.equal(await page.locator("#songPickerModes").isHidden(), true);
  assert.equal(await page.locator("#songPickerActions").isHidden(), true);
  assert.equal(await page.locator("#previousSong").isHidden(), true);
  assert.deepEqual(
    await page.locator("#songSuggestionResults .song-suggestion").allTextContents(),
    ["Bread of Life Listen ↗Composer One", "One BreadComposer Two"],
  );
  const listen = page.locator("#songSuggestionResults .song-suggestion-listen");
  assert.equal(await listen.count(), 1);
  assert.equal(
    await listen.getAttribute("href"),
    "https://www.youtube.com/watch?v=AAAAAAAAAAA",
  );
  assert.equal(await listen.getAttribute("target"), "_blank");
  assert.equal(
    await page.locator("#songSuggestionResults button").count(),
    0,
  );
  assert.equal(await page.getByText("Search by title").isHidden(), true);
  assert.deepEqual(
    await page.evaluate(() => window.__publicSuggestionCalls),
    [{
      citations: [
        "Isaiah 55:1-3",
        "Psalm 145:8-9, 15-16, 17-18",
        "Romans 8:35, 37-39",
        "Matthew 14:13-21",
      ],
      part: "communion",
    }],
  );
  await context.close();
});

test("public users can open an ordered YouTube listening queue", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.route("https://www.youtube-nocookie.com/**", route => route.abort());
  await page.route("https://www.youtube.com/iframe_api", route =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.YT = {
          Player: class {
            constructor(element, options) {
              this.events = options.events;
              this.index = 0;
              window.__practicePlayerApi = this;
              queueMicrotask(() => this.events.onReady({ target: this }));
            }
            getPlaylistIndex() { return this.index; }
            loadPlaylist(options) {
              this.index = options.index;
              window.__practicePlaylistLoad = options;
            }
            stopVideo() {}
          }
        };
        queueMicrotask(() => window.onYouTubeIframeAPIReady());
      `,
    }),
  );
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
              id: "practice-entrance",
              title: "Opening Hymn",
              youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
            },
            psalm: {
              id: "practice-psalm",
              title: "Psalm without video",
              youtubeUrl: "",
            },
            communion: {
              id: "practice-communion",
              title: "Communion Hymn",
              youtubeUrl: "https://youtube.com/watch?v=BBBBBBBBBBB",
            },
            communion2: {
              id: "practice-communion-repeat",
              title: "Opening Hymn reprise",
              youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
            },
          },
          readingOverrides: {},
          celebrationOverride: null,
        });
        return () => {};
      },
    });
  });

  assert.equal(await page.locator("#practiceAll").isEnabled(), true);
  assert.equal(
    await page.locator("#practiceAllAvailability").textContent(),
    "3/4",
  );
  await page.locator("#practiceAll").click();
  await page.waitForFunction(() => Boolean(window.__practicePlaylistLoad));

  const dialog = page.locator("#practiceDialog");
  await assert.doesNotReject(() => dialog.waitFor({ state: "visible" }));
  assert.equal(await dialog.locator("h2").textContent(), "Listen to this Mass");
  assert.equal(await dialog.getByText("Temporary YouTube queue").count(), 0);
  assert.equal(
    await page.locator("#practiceDialogSummary").textContent(),
    "3 of 4 selected songs available. 1 will be skipped.",
  );
  assert.deepEqual(
    await page.locator("#practiceQueueList .practice-queue-item").allTextContents(),
    [
      "EntranceOpening Hymn",
      "Communion 1Communion Hymn",
      "Communion 2Opening Hymn reprise",
    ],
  );
  const source = await page.locator("#practicePlayer").getAttribute("src");
  const playerUrl = new URL(source);
  assert.equal(playerUrl.hostname, "www.youtube-nocookie.com");
  assert.equal(playerUrl.pathname, "/embed/AAAAAAAAAAA");
  assert.equal(playerUrl.searchParams.get("playlist"), null);
  assert.deepEqual(
    await page.evaluate(() => window.__practicePlaylistLoad),
    {
      playlist: ["AAAAAAAAAAA", "BBBBBBBBBBB", "AAAAAAAAAAA"],
      index: 0,
      startSeconds: 0,
    },
  );
  await page.evaluate(() => {
    window.__practicePlayerApi.index = 1;
    window.__practicePlayerApi.events.onStateChange({
      target: window.__practicePlayerApi,
    });
  });
  assert.match(
    await page.locator("#practiceQueueList .practice-queue-item.current").innerText(),
    /Communion Hymn/,
  );

  const layout = await dialog.evaluate(element => ({
    dialogBottom: element.getBoundingClientRect().bottom,
    viewportHeight: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
  }));
  assert.ok(layout.dialogBottom <= layout.viewportHeight);
  assert.equal(layout.documentWidth, layout.viewportWidth);

  await page.locator("#practiceDialogClose").click();
  await assert.doesNotReject(() => dialog.waitFor({ state: "hidden" }));
  assert.equal(await page.locator("#practicePlayer").getAttribute("src"), null);
  await context.close();
});

test("mobile reading links reveal unobscured text without orphaning verse numbers", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 320, height: 700 },
  );
  const gospelLink = page.locator('#readingSummary a[href="#reading-gospel"]');
  await gospelLink.click();
  const targetPosition = await page.locator("#reading-gospel").evaluate(element => ({
    top: element.getBoundingClientRect().top,
    viewportHeight: innerHeight,
  }));
  assert.ok(targetPosition.top >= 0);
  assert.ok(targetPosition.top < targetPosition.viewportHeight);

  const readingLayout = await page.evaluate(() => {
    const superscriptDigits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    const markerPattern = new RegExp(`[${superscriptDigits}]+\\u202f\\S`, "gu");
    let markers = 0;
    const splitMarkers = [];
    const texts = [...document.querySelectorAll(".rtext")];
    texts.forEach((element, readingIndex) => {
      const node = element.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      for (const match of node.data.matchAll(markerPattern)) {
        markers += 1;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const lines = new Set(
          [...range.getClientRects()].map(rect => Math.round(rect.top)),
        );
        if (lines.size !== 1) {
          splitMarkers.push({ readingIndex, marker: match[0], lines: [...lines] });
        }
      }
    });
    return {
      markers,
      splitMarkers,
      includesElision: texts.some(element => element.textContent.includes("[...]")),
    };
  });
  assert.ok(readingLayout.markers > 0);
  assert.deepEqual(readingLayout.splitMarkers, []);
  assert.equal(readingLayout.includesElision, true);
  await context.close();
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
  assert.equal(new URL(page.url()).searchParams.get("date"), "2026-08-09");
  await page.locator("#prev").click();
  assert.equal(await page.locator("#dateDisplay").textContent(), beforeDate);
  assert.equal(new URL(page.url()).searchParams.get("date"), "2026-08-02");

  await page.locator("#date").fill("2126-07-27");
  await page.locator("#date").dispatchEvent("change");
  assert.equal(await page.locator("#date").inputValue(), "2126-07-28");
  assert.match(await page.locator("#dateDisplay").textContent(), /28 Jul 2126/);
  assert.equal(new URL(page.url()).searchParams.get("date"), "2126-07-28");
  await page.locator("#prev").click();
  assert.equal(await page.locator("#date").inputValue(), "2126-07-21");
  await page.locator("#next").click();
  assert.equal(await page.locator("#date").inputValue(), "2126-07-28");

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

test("the selected Sunday survives a reload and browser history navigation", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );

  const initialDate = await page.locator("#date").inputValue();
  await page.locator("#next").click();
  const nextDate = await page.locator("#date").inputValue();
  assert.notEqual(nextDate, initialDate);
  assert.equal(new URL(page.url()).searchParams.get("date"), nextDate);

  await page.reload();
  assert.equal(await page.locator("#date").inputValue(), nextDate);

  await page.goBack();
  assert.equal(await page.locator("#date").inputValue(), initialDate);

  await page.goForward();
  assert.equal(await page.locator("#date").inputValue(), nextDate);
  await context.close();
});

test("repertoire collection and search state survive reload and browser history", async () => {
  const { context, page } = await repertoirePage(
    browser,
    server,
    { width: 390, height: 844 },
  );

  await page.locator('[data-repertoire-scope="library"]').click();
  await page.locator("#repertoireSearch").fill("city");
  await page.waitForFunction(() =>
    new URL(location.href).searchParams.get("q") === "city",
  );
  assert.equal(
    new URL(page.url()).search,
    "?scope=library&q=city",
  );
  assert.match(await page.locator("#repertoireList").innerText(), /City of Hope/);
  assert.doesNotMatch(await page.locator("#repertoireList").innerText(), /Bread for the World/);

  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector("#repertoireStatus")?.textContent === "Up to date",
  );
  assert.equal(await page.locator("#repertoireSearch").inputValue(), "city");
  assert.equal(
    await page.locator('[data-repertoire-scope="library"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.match(await page.locator("#repertoireList").innerText(), /City of Hope/);

  await page.locator('[data-repertoire-scope="repertoire"]').click();
  assert.match(await page.locator("#repertoireList").innerText(), /City of God/);
  await page.goBack();
  assert.equal(
    await page.locator('[data-repertoire-scope="library"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.match(await page.locator("#repertoireList").innerText(), /City of Hope/);
  await context.close();
});

test("editor song picker preserves the page and supports keyboard selection of duplicate titles", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    const duplicateSongs = [
      {
        id: "aaaaaaaa-1111-2222-3333-444444444444",
        title: "Shared title",
        authors: "First Author",
        lyrics: "FIRST PRIVATE LYRIC",
      },
      {
        id: "bbbbbbbb-1111-2222-3333-444444444444",
        title: "Shared title",
        authors: "Second Author",
        lyrics: "SECOND PRIVATE LYRIC",
      },
    ];
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: { id: "editor" }, isEditor: true });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs: {}, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      suggestSongs() {
        return Promise.resolve([
          { id: "suggested-1", title: "Suggested one", authors: "One" },
          { id: "suggested-2", title: "Suggested two", authors: "Two" },
          { id: "suggested-3", title: "Suggested three", authors: "Three" },
        ]);
      },
      searchSongs() {
        return Promise.resolve(duplicateSongs);
      },
      assignSong(date, part, songId) {
        window.__assignedSong = { date, part, songId };
        return Promise.resolve();
      },
    });
  });

  const chooseCommunion = page.locator(
    'button[data-song-action="choose"][data-part="communion"]',
  );
  const selectedDate = await page.locator("#date").inputValue();
  await chooseCommunion.scrollIntoViewIfNeeded();
  const pageScroll = await page.evaluate(() => window.scrollY);
  assert.ok(pageScroll > 0);
  await chooseCommunion.click();

  const picker = page.locator("#songPickerDialog");
  await assert.doesNotReject(() => picker.waitFor({ state: "visible" }));
  assert.equal(
    await page.locator("#songSuggestionResults .song-suggestion").count(),
    3,
  );
  const locked = await page.evaluate(() => ({
    modalOpen: document.documentElement.classList.contains("modal-open"),
    pageTop: document.body.style.getPropertyValue("--modal-page-top"),
    activeId: document.activeElement?.id,
  }));
  assert.equal(locked.modalOpen, true);
  assert.equal(locked.pageTop, `-${pageScroll}px`);
  assert.notEqual(locked.activeId, "songSearch");

  await page.locator("#songModeSearch").click();
  await page.locator("#songSearch").fill("Shared title");
  const results = page.locator("#songResults .song-result");
  await assert.doesNotReject(() => results.first().waitFor({ state: "visible" }));
  assert.equal(await results.count(), 2);
  assert.match(await results.nth(0).innerText(), /First Author/);
  assert.match(await results.nth(1).innerText(), /Second Author/);
  assert.equal(await page.getByText("FIRST PRIVATE LYRIC").count(), 0);
  assert.equal(await page.getByText("SECOND PRIVATE LYRIC").count(), 0);

  await results.nth(1).click();
  const useSong = page.locator("#useSong");
  assert.equal(await useSong.isEnabled(), true);
  await useSong.focus();
  await page.keyboard.press("Enter");
  await assert.doesNotReject(() => picker.waitFor({ state: "hidden" }));
  await page.waitForFunction(() =>
    !document.documentElement.classList.contains("modal-open"),
  );

  assert.deepEqual(
    await page.evaluate(() => window.__assignedSong),
    {
      date: selectedDate,
      part: "communion",
      songId: "bbbbbbbb-1111-2222-3333-444444444444",
    },
  );
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - pageScroll) <= 1);
  assert.match(
    await page.locator('.music-edit-row:has([data-part="communion"])').innerText(),
    /Shared title[\s\S]*Second Author/,
  );
  await context.close();
});

test("editor can reuse the matching song from the previous Sunday in one tap", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: { id: "editor" }, isEditor: true });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs: {}, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      getPlan(date) {
        window.__previousPlanDate = date;
        return Promise.resolve({
          songs: {
            entrance: {
              id: "previous-entrance",
              title: "Last Sunday Entrance",
              authors: "Previous Composer",
            },
          },
          readingOverrides: {},
          celebrationOverride: null,
        });
      },
      suggestSongs() {
        return Promise.resolve([]);
      },
      assignSong(date, part, songId) {
        window.__assignedPreviousSong = { date, part, songId };
        return Promise.resolve();
      },
    });
  });

  const selectedDate = await page.locator("#date").inputValue();
  const previousDate = new Date(`${selectedDate}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 7);
  await page.locator(
    'button[data-song-action="choose"][data-part="entrance"]',
  ).click();

  const previous = page.locator("#previousSong");
  await assert.doesNotReject(() => previous.waitFor({ state: "visible" }));
  assert.match(await previous.innerText(), /LAST SUNDAY[\s\S]*Last Sunday Entrance/);
  assert.match(await previous.innerText(), /Previous Composer/);
  assert.equal(
    await page.evaluate(() => window.__previousPlanDate),
    previousDate.toISOString().slice(0, 10),
  );

  await page.locator("#usePreviousSong").click();
  await assert.doesNotReject(() =>
    page.locator("#songPickerDialog").waitFor({ state: "hidden" }),
  );
  assert.deepEqual(
    await page.evaluate(() => window.__assignedPreviousSong),
    {
      date: selectedDate,
      part: "entrance",
      songId: "previous-entrance",
    },
  );
  assert.match(
    await page.locator('.music-edit-row:has([data-part="entrance"])').innerText(),
    /Last Sunday Entrance/,
  );
  await context.close();
});

test("editor can create a private-lyric song with explicit suggestion positions", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: { id: "editor" }, isEditor: true });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs: {}, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      suggestSongs() {
        return Promise.resolve([]);
      },
      searchSongs() {
        return Promise.resolve([]);
      },
      createAndAssignSong(date, part, draft) {
        window.__createdSong = { date, part, draft };
        return Promise.resolve({ id: "created-song", ...draft });
      },
      syncSongEmbedding(songId) {
        window.__indexedSong = songId;
        return Promise.resolve();
      },
    });
  });

  const selectedDate = await page.locator("#date").inputValue();
  await page.locator(
    'button[data-song-action="choose"][data-part="communion2"]',
  ).click();
  await page.locator("#songModeCreate").click();
  const editor = page.locator("#songEditorDialog");
  await assert.doesNotReject(() => editor.waitFor({ state: "visible" }));
  await page.waitForFunction(() => document.activeElement?.id === "songTitle");

  const communionPart = page.locator(
    '#songSuggestionParts input[value="communion"]',
  );
  assert.equal(await communionPart.isChecked(), true);
  assert.equal(
    await page.locator('#songSuggestionParts input[value="communion2"]').count(),
    0,
  );
  await communionPart.uncheck();
  await page.locator(
    '#songSuggestionParts input[value="offertory"]',
  ).check();
  await page.locator(
    '#songSuggestionParts input[value="recessional"]',
  ).check();
  await page.locator("#songTitle").fill("New duplicate title");
  await page.locator("#songAuthors").fill("Test Composer");
  assert.equal(
    await page.locator("#songLyricsSummary").textContent(),
    "Add lyrics now (optional)",
  );
  await page.locator(".song-lyrics-section summary").click();
  await page.locator("#songLyrics").fill("EDITOR-ONLY CREATED LYRIC");
  await page.locator("#saveSong").focus();
  await page.keyboard.press("Enter");
  await assert.doesNotReject(() => editor.waitFor({ state: "hidden" }));
  await page.waitForFunction(() => window.__indexedSong === "created-song");

  const created = await page.evaluate(() => window.__createdSong);
  assert.equal(created.date, selectedDate);
  assert.equal(created.part, "communion2");
  assert.equal(created.draft.title, "New duplicate title");
  assert.equal(created.draft.lyrics, "EDITOR-ONLY CREATED LYRIC");
  assert.deepEqual(created.draft.suggestionParts, ["offertory", "recessional"]);
  const communionRow = page.locator(
    '.music-edit-row:has([data-part="communion2"])',
  );
  assert.match(await communionRow.innerText(), /New duplicate title/);
  assert.equal(await page.getByText("EDITOR-ONLY CREATED LYRIC").count(), 0);
  await context.close();
});

test("editor downloads a complete private-lyrics PowerPoint in Mass order", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    const songs = {
      entrance: { id: "pptx-entrance", title: "Gathered in Hope", authors: "Test Author" },
      communion: { id: "pptx-communion", title: "Bread for the Journey", authors: "Other Author" },
      communion2: { id: "pptx-entrance", title: "Gathered in Hope", authors: "Test Author" },
    };
    const privateSongs = {
      "pptx-entrance": {
        ...songs.entrance,
        lyrics: "ENTRANCE PRIVATE LINE ONE\nENTRANCE PRIVATE LINE TWO",
      },
      "pptx-communion": {
        ...songs.communion,
        lyrics: "COMMUNION PRIVATE LINE ONE\n\nCOMMUNION PRIVATE LINE TWO",
      },
    };
    window.__pptxPrivateFetches = [];
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: { id: "editor" }, isEditor: true });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      getSong(id) {
        window.__pptxPrivateFetches.push(id);
        return Promise.resolve(privateSongs[id]);
      },
    });
  });

  const button = page.locator("#downloadLyricsPptx");
  await assert.doesNotReject(() => button.waitFor({ state: "visible" }));
  assert.equal(await page.getByText("ENTRANCE PRIVATE LINE ONE").count(), 0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  assert.match(download.suggestedFilename(), /^st-james-lyrics-\d{4}-\d{2}-\d{2}\.pptx$/);
  await page.waitForFunction(() =>
    document.querySelector("#lyricsPptxStatus")?.textContent === "PowerPoint downloaded.",
  );
  assert.deepEqual(
    await page.evaluate(() => window.__pptxPrivateFetches),
    ["pptx-entrance", "pptx-communion"],
  );
  assert.equal(await page.getByText("COMMUNION PRIVATE LINE ONE").count(), 0);

  const downloadedPath = await download.path();
  const buffer = fs.readFileSync(downloadedPath);
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]));
  assert.equal(slideFiles.length, 4);
  const slideText = await Promise.all(
    slideFiles.map(name => zip.file(name).async("string")),
  );
  assert.match(slideText[1], /ENTRANCE PRIVATE LINE ONE/);
  assert.match(slideText[2], /COMMUNION PRIVATE LINE ONE/);
  assert.match(slideText[3], /ENTRANCE PRIVATE LINE ONE/);

  await context.close();
});

test("editor downloads a widescreen lyrics PDF matching the PowerPoint pagination", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    const songs = {
      entrance: { id: "slides-entrance", title: "Gathered in Hope", authors: "Test Author" },
      communion: { id: "slides-communion", title: "Bread for the Journey", authors: "Other Author" },
      communion2: { id: "slides-entrance", title: "Gathered in Hope", authors: "Test Author" },
    };
    const privateSongs = {
      "slides-entrance": {
        ...songs.entrance,
        lyrics: "ENTRANCE PRIVATE LINE ONE\nENTRANCE PRIVATE LINE TWO",
      },
      "slides-communion": {
        ...songs.communion,
        lyrics: "COMMUNION PRIVATE LINE ONE\n\nCOMMUNION PRIVATE LINE TWO",
      },
    };
    window.__slidesPrivateFetches = [];
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: { id: "editor" }, isEditor: true });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      getSong(id) {
        window.__slidesPrivateFetches.push(id);
        return Promise.resolve(privateSongs[id]);
      },
    });
  });

  const button = page.locator("#downloadLyricsSlidesPdf");
  await assert.doesNotReject(() => button.waitFor({ state: "visible" }));
  assert.equal(await page.getByText("ENTRANCE PRIVATE LINE ONE").count(), 0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  assert.match(download.suggestedFilename(), /^st-james-lyrics-\d{4}-\d{2}-\d{2}\.pdf$/);
  await page.waitForFunction(() =>
    document.querySelector("#lyricsPptxStatus")?.textContent === "PDF downloaded.",
  );
  assert.deepEqual(
    await page.evaluate(() => window.__slidesPrivateFetches),
    ["slides-entrance", "slides-communion"],
  );
  assert.equal(await page.getByText("ENTRANCE PRIVATE LINE ONE").count(), 0);

  const pdf = fs.readFileSync(await download.path());
  const geometry = pdfPageGeometry(pdf);
  assert.equal(geometry.pageCount, 4);
  geometry.boxes.forEach(({ width, height }) => {
    assert.ok(Math.abs(width - 960) < 2, `unexpected slide width ${width}`);
    assert.ok(Math.abs(height - 540) < 2, `unexpected slide height ${height}`);
  });
  const source = pdf.toString("latin1");
  assert.match(source, /Gathered in Hope/);
  assert.match(source, /ENTRANCE PRIVATE LINE ONE/);
  assert.match(source, /COMMUNION PRIVATE LINE ONE/);
  await context.close();
});

test("editor downloads private lyrics as an imposed landscape A4 booklet PDF", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    const songs = {
      entrance: { id: "booklet-entrance", title: "Gathered & Sent", authors: "Test Author" },
      psalm: { id: "booklet-psalm", title: "The Lord Feeds Us" },
      communion: { id: "booklet-communion", title: "Bread for the Journey" },
      communion2: { id: "booklet-entrance", title: "Gathered & Sent", authors: "Test Author" },
    };
    const privateSongs = {
      "booklet-entrance": {
        ...songs.entrance,
        copyrightOwner: "Test Publisher",
        copyrightYear: "2026",
        lyrics: "Refrain:\nENTRANCE PRIVATE LINE ONE\nENTRANCE PRIVATE LINE TWO",
      },
      "booklet-communion": {
        ...songs.communion,
        lyrics: "COMMUNION PRIVATE LINE ONE\n\nCOMMUNION PRIVATE LINE TWO",
      },
      "booklet-psalm": {
        ...songs.psalm,
        lyrics: "Response:\nPSALM RESPONSE FOR EVERYONE\n\n"
          + "Verse 1\nPSALM VERSE FOR THE CANTOR ONLY",
      },
    };
    window.__bookletPrivateFetches = [];
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: { id: "editor" }, isEditor: true });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs, readingOverrides: {}, celebrationOverride: null });
        return () => {};
      },
      getSong(id) {
        window.__bookletPrivateFetches.push(id);
        return Promise.resolve(privateSongs[id]);
      },
    });
  });

  const button = page.locator("#printLyricsBooklet");
  await assert.doesNotReject(() => button.waitFor({ state: "visible" }));
  const mobileLayout = await page.evaluate(() => {
    const action = document.querySelector("#printLyricsBooklet").getBoundingClientRect();
    return {
      innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      actionLeft: action.left,
      actionRight: action.right,
      hintVisible: Boolean(document.querySelector(".booklet-print-hint")?.offsetParent),
    };
  });
  assert.equal(mobileLayout.documentWidth, mobileLayout.innerWidth);
  assert.ok(mobileLayout.actionLeft >= 0);
  assert.ok(mobileLayout.actionRight <= mobileLayout.innerWidth);
  assert.equal(mobileLayout.hintVisible, true);
  assert.equal(await page.getByText("ENTRANCE PRIVATE LINE ONE").count(), 0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.click(),
  ]);
  assert.match(download.suggestedFilename(), /^st-james-booklet-\d{4}-\d{2}-\d{2}\.pdf$/);
  await page.waitForFunction(() =>
    document.querySelector("#lyricsPptxStatus")?.textContent?.startsWith("Booklet downloaded."),
  );
  assert.deepEqual(
    await page.evaluate(() => window.__bookletPrivateFetches),
    ["booklet-entrance", "booklet-psalm", "booklet-communion"],
  );
  assert.equal(await page.getByText("ENTRANCE PRIVATE LINE ONE").count(), 0);

  const pdf = fs.readFileSync(await download.path());
  assertA4LandscapePages(pdf, 4);
  const source = pdf.toString("latin1");
  assert.match(source, /Gathered & Sent/);
  assert.match(source, /ENTRANCE PRIVATE LINE ONE/);
  assert.match(source, /ALL/);
  assert.match(source, /PSALM RESPONSE FOR EVERYONE/);
  assert.match(source, /CANTOR/);
  assert.match(source, /PSALM VERSE FOR THE CANTOR ONLY/);
  assert.match(source, /COMMUNION PRIVATE LINE TWO/);
  await context.close();
});

test("Chrome produces dedicated A4 music and readings PDFs without private lyrics", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => {
    const keys = [
      "entrance", "kyrie", "gloria", "psalm", "acclamation", "offertory",
      "sanctus", "memorial", "amen", "lordPrayer", "agnus", "communion",
      "communion2", "recessional",
    ];
    const songs = Object.fromEntries(keys.map((key, index) => [key, {
      id: `print-song-${index}`,
      title: key === "entrance" ? "<Unsafe & hymn>" : `Print song ${index + 1}`,
      authors: key === "recessional" ? "" : `Author ${index + 1}`,
      copyrightYear: key === "recessional" ? "" : "2026",
      copyrightOwner: key === "recessional" ? "" : "Test Publisher",
      source: "",
      lyrics: `PRIVATE PRINT LYRIC ${index + 1}`,
    }]));
    const celebrationOverride = {
      name: "Saint James the Apostle — print override",
      rank: "Solemnity",
      sourceDate: "2026-07-25",
      readings: {
        first: "Acts 11:19-21; 12:1-2, 24",
        psalm: "Psalm 67:2-3, 5, 7-8",
        second: "2 Corinthians 4:7-15",
        gospel: "Matthew 20:20-28",
      },
    };
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: null, isEditor: false });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({
          songs,
          celebrationOverride,
          readingOverrides: {
            gospel: {
              citation: "John 6:1-15",
              confirmedAgainstOrdo: true,
            },
          },
        });
        return () => {};
      },
    });
    window.print = () => {};
  });

  await page.locator("#printMusic").click();
  await page.emulateMedia({ media: "print" });
  const printState = await page.evaluate(() => ({
    appDisplay: getComputedStyle(document.querySelector(".wrap")).display,
    sheetDisplay: getComputedStyle(document.querySelector("#printSheet")).display,
    html: document.querySelector("#printSheet").innerHTML,
    text: document.querySelector("#printSheet").innerText,
  }));
  assert.equal(printState.appDisplay, "none");
  assert.equal(printState.sheetDisplay, "block");
  assert.match(printState.html, /&lt;Unsafe &amp; hymn&gt;/);
  assert.doesNotMatch(printState.html, /<unsafe/i);
  assert.match(printState.text, /Communion 1[\s\S]*Print song 12/i);
  assert.match(printState.text, /Communion 2[\s\S]*Print song 13/i);
  assert.match(printState.text, /Copyright information incomplete/);
  assert.doesNotMatch(printState.text, /PRIVATE PRINT LYRIC/);

  const musicPdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  const musicPages = assertA4Pages(musicPdf, 1);

  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.locator("#printMusicReadings").click();
  await page.emulateMedia({ media: "print" });
  const readingText = await page.locator("#printSheet").innerText();
  assert.match(readingText, /Saint James the Apostle — print override/);
  assert.match(readingText, /Solemnity · normally Saturday, 25 July 2026/);
  assert.match(readingText, /Second Reading[\s\S]*2 Corinthians 4:7-15/);
  assert.match(readingText, /Gospel[\s\S]*John 6:1-15/);
  assert.match(readingText, /After these things, Jesus went away/);
  assert.match(readingText, /Mass readings/);
  assert.match(readingText, /First Reading/);
  assert.match(readingText, /Gospel/);
  assert.doesNotMatch(readingText, /PRIVATE PRINT LYRIC/);

  const readingsPdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
  });
  const readingPages = assertA4Pages(readingsPdf, 2);
  assert.ok(readingPages > musicPages);

  await context.close();
});

test("a service-worker-controlled offline reload shows and prints the saved public plan", async () => {
  const { context, page } = await plannerPage(
    browser,
    server,
    { width: 390, height: 844 },
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const selectedDate = await page.locator("#date").inputValue();
  const productionConfig = fs.readFileSync(
    path.join(ROOT, "supabase-config.js"),
    "utf8",
  );
  await page.evaluate(({ date, config }) => {
    localStorage.setItem(`st-james-plan-cache-v2-${date}`, JSON.stringify({
      songs: {
        entrance: {
          id: "offline-song",
          title: "Offline Processional",
          authors: "Cached Composer",
          copyrightYear: "2026",
          copyrightOwner: "Cached Publisher",
          source: "",
          suggestionParts: ["entrance"],
        },
      },
      readingOverrides: {},
      celebrationOverride: null,
    }));
    return caches.keys().then(async names => {
      const cache = await caches.open(names.find(name =>
        name.startsWith("st-james-mass-planner-")));
      const configUrl = [...document.scripts]
        .map(script => script.src)
        .find(url => url.includes("/supabase-config.js"));
      await cache.put(
        new Request(configUrl),
        new Response(config, {
          headers: { "Content-Type": "text/javascript; charset=utf-8" },
        }),
      );
    });
  }, { date: selectedDate, config: productionConfig });

  await page.unroute("**/supabase-config.js*");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    document.querySelector("#syncStatus")?.textContent.includes(
      "Offline — showing saved copy",
    ),
  );
  assert.match(await page.locator("#musicList").innerText(), /Offline Processional/);

  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.locator("#printMusicReadings").click();
  const printText = await page.locator("#printSheet").innerText();
  assert.match(printText, /Offline Processional/);
  assert.match(printText, /Mass readings/);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  await page.locator("#next").click();
  await page.waitForFunction(() =>
    document.querySelector("#syncStatus")?.textContent.includes(
      "Offline — no saved plan",
    ),
  );
  assert.doesNotMatch(await page.locator("#musicList").innerText(), /Offline Processional/);

  await context.close();
});
