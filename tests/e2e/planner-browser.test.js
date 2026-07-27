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
    window.massPlanApp.connect({
      subscribeAuth(callback) {
        callback({ user: null, isEditor: false });
        return () => {};
      },
      subscribePlan(date, onValue) {
        onValue({ songs, readingOverrides: {}, celebrationOverride: null });
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
  assert.match(printState.text, /Communion Hymn 1[\s\S]*Print song 12/i);
  assert.match(printState.text, /Communion Hymn 2[\s\S]*Print song 13/i);
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
