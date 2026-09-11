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

test("application logger preserves error-like values that are not Error instances", () => {
  const originalConsoleError = console.error;
  const seen = [];
  console.error = () => {};

  try {
    // Mirrors a DOMException (e.g. AbortError from an aborted fetch), which
    // carries a real message/name but is not `instanceof Error`.
    const abortLike = { name: "AbortError", message: "The operation was aborted." };
    AppLogger.error(abortLike);
    AppLogger.setReporter(entry => seen.push(entry));

    assert.equal(seen.length, 1);
    assert.ok(seen[0].error instanceof Error);
    assert.equal(seen[0].error.message, "The operation was aborted.");
    assert.equal(seen[0].error.name, "AbortError");
    assert.equal(seen[0].error.cause, abortLike);
    assert.equal(seen[0].label, "The operation was aborted.");
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
