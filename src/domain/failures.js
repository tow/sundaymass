// Tells a condition the user can resolve apart from a defect in the planner.
//
// "Editor access required", "you are offline", "add canonical lyrics first", a mistyped
// password: each is the application working correctly and telling somebody what to do
// next. Reporting those as faults buries the failures that are genuinely ours. A failure
// is classified where it is created — the layer that knows why it happened — and every
// layer above only passes it along: stores classify vendor errors because they own the
// vendor, loaders classify fetch failures because they own the fetch, controllers
// display the message, and AppLogger only chooses a level from the mark.
(function (global) {
  "use strict";

  // Marks a failure as a condition the user can act on. The message is shown to them,
  // so it must be a sentence worth reading.
  function expected(message, cause) {
    const failure = new Error(message);
    failure.expected = true;
    if (cause !== undefined) failure.cause = cause;
    return failure;
  }

  // Marks an existing error in place, for failures raised by someone else's code that
  // we recognise but did not construct.
  function markExpected(error) {
    if (error && typeof error === "object") error.expected = true;
    return error;
  }

  function isExpected(value) {
    return Boolean(value && typeof value === "object" && value.expected === true);
  }

  // Supabase reports a wrong email or password as an ordinary auth failure. Recognised
  // here, once, so no store or controller has to know the vendor's error shape.
  function isRejectedCredentials(error) {
    if (!error || error.name !== "AuthApiError") return false;
    return error.code === "invalid_credentials" || error.status === 400;
  }

  // A request that never got a response: each browser words it differently, and
  // supabase-js hands the browser's wording back as a PostgREST message or details.
  // This recognises only the shape. Whether it is the user's connection or our own
  // breakage (a misdeployed bundle, an unreachable backend) is for the caller to judge,
  // usually by asking whether the browser is still online. A bundle that loads but
  // will not parse is a defect, and is not matched here.
  const FETCH_FAILURE =
    /dynamically imported module|Failed to fetch|NetworkError|Load failed|network request|internet connection/i;

  function isFetchFailure(error) {
    return FETCH_FAILURE.test([error?.message, error?.details].filter(Boolean).join(" "));
  }

  const api = Object.freeze({
    expected,
    isExpected,
    isFetchFailure,
    isRejectedCredentials,
    markExpected,
  });
  global.Failures = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
