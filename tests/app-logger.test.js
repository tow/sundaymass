const assert = require("node:assert/strict");
const test = require("node:test");

const AppLogger = require("../src/services/app-logger.js");
const Failures = require("../src/domain/failures.js");

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

test("application logger keeps details from a thrown value with no message, alongside its label", () => {
  const originalConsoleError = console.error;
  const seen = [];
  console.error = () => {};

  try {
    // Third-party code (e.g. a PDF/export library) can reject with a plain
    // object that has no `message`, carrying only a diagnostic code.
    const codeOnly = { code: "SecurityError" };
    AppLogger.error("Could not create lyrics PDF", codeOnly);
    AppLogger.setReporter(entry => seen.push(entry));

    assert.equal(seen.length, 1);
    assert.ok(seen[0].error instanceof Error);
    assert.equal(seen[0].error.message, 'Could not create lyrics PDF {"code":"SecurityError"}');
    assert.equal(seen[0].label, "Could not create lyrics PDF");
  } finally {
    AppLogger.setReporter(null);
    console.error = originalConsoleError;
  }
});

test("application logger falls back to a generic message when nothing useful was thrown", () => {
  const originalConsoleError = console.error;
  const seen = [];
  console.error = () => {};

  try {
    AppLogger.error("Could not create lyrics PDF", undefined);
    AppLogger.setReporter(entry => seen.push(entry));

    assert.equal(seen.length, 1);
    assert.equal(seen[0].error.message, "Could not create lyrics PDF");
    assert.equal(seen[0].label, "Could not create lyrics PDF");
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

test("conditions the user can resolve are reported as warnings, not faults", () => {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const seen = [];
  console.error = () => assert.fail("an expected condition must not reach console.error");
  console.warn = () => {};

  try {
    AppLogger.setReporter(entry => seen.push(entry));
    const condition = Failures.expected("Add canonical lyrics for Panginoon, Maawa ka first.");
    AppLogger.error("Could not load weekly lyrics", condition);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].level, "warn");
    assert.equal(seen[0].label, "Could not load weekly lyrics");
    assert.equal(seen[0].error, condition);
  } finally {
    AppLogger.setReporter(null);
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
});

test("a plain Error marked expected by a module is treated the same way", () => {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const seen = [];
  console.error = () => assert.fail("an expected condition must not reach console.error");
  console.warn = () => {};

  try {
    AppLogger.setReporter(entry => seen.push(entry));
    // Stores mark their own errors rather than depending on the logger loading first.
    const condition = Object.assign(new Error("Editor access required"), { expected: true });
    AppLogger.error("Could not save song assignment", condition);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].level, "warn");
    assert.ok(Failures.isExpected(condition));
  } finally {
    AppLogger.setReporter(null);
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
});

test("genuine faults are still reported as errors", () => {
  const originalConsoleError = console.error;
  const seen = [];
  console.error = () => {};

  try {
    AppLogger.setReporter(entry => seen.push(entry));
    const fault = new Error("Reading catalogue response was invalid");
    AppLogger.error("Could not load reading library", fault);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].level, "error");
    assert.equal(seen[0].error, fault);
    assert.equal(Failures.isExpected(fault), false);
  } finally {
    AppLogger.setReporter(null);
    console.error = originalConsoleError;
  }
});
