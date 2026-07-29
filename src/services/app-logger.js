// Central browser logger. Errors are buffered until optional monitoring is ready.
(function (global) {
  "use strict";

  const pending = [];
  let reporter = null;

  function labelFrom(values, fallback) {
    return values.find(value => typeof value === "string") || fallback;
  }

  function errorFrom(values) {
    return values.find(value => value instanceof Error)
      || new Error(values.filter(value => typeof value === "string").join(" ") || "Application error");
  }

  function error(...values) {
    console.error(...values);
    const failure = errorFrom(values);
    const entry = Object.freeze({
      level: "error",
      error: failure,
      label: labelFrom(values, failure.message),
    });
    if (reporter) reporter(entry);
    else pending.push(entry);
  }

  function warn(...values) {
    console.warn(...values);
    const entry = Object.freeze({
      level: "warn",
      error: values.find(value => value instanceof Error) || null,
      label: labelFrom(values, "Application warning"),
    });
    if (reporter) reporter(entry);
    else pending.push(entry);
  }

  function info(...values) {
    console.info(...values);
    const entry = Object.freeze({
      level: "info",
      error: null,
      label: labelFrom(values, "Application information"),
    });
    if (reporter) reporter(entry);
    else pending.push(entry);
  }

  function setReporter(value) {
    reporter = typeof value === "function" ? value : null;
    if (!reporter) return;
    pending.splice(0).forEach(entry => reporter(entry));
  }

  const api = Object.freeze({ error, info, setReporter, warn });
  global.AppLogger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
