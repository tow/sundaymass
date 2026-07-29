const assert = require("node:assert/strict");
const test = require("node:test");

const AppLogger = require("../src/services/app-logger.js");

test("application logger buffers caught errors until monitoring is ready", () => {
  const originalConsoleError = console.error;
  const seen = [];
  console.error = () => {};

  try {
    const failure = new Error("save failed");
    AppLogger.error("Could not save plan", failure);
    AppLogger.setReporter(entry => seen.push(entry));

    assert.equal(seen.length, 1);
    assert.equal(seen[0].error, failure);
    assert.equal(seen[0].label, "Could not save plan");
  } finally {
    AppLogger.setReporter(null);
    console.error = originalConsoleError;
  }
});

test("application logger forwards explicit warnings and informational logs", () => {
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const seen = [];
  console.warn = () => {};
  console.info = () => {};
  AppLogger.setReporter(entry => seen.push(entry));

  try {
    AppLogger.warn("Using cached plan");
    AppLogger.info("Application ready");

    assert.deepEqual(
      seen.map(({ level, label }) => ({ level, label })),
      [
        { level: "warn", label: "Using cached plan" },
        { level: "info", label: "Application ready" },
      ],
    );
  } finally {
    AppLogger.setReporter(null);
    console.warn = originalWarn;
    console.info = originalInfo;
  }
});
