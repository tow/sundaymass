// Reloads a page that predates the deployment serving this file.
//
// A page left open across deployments keeps running the code it loaded, and the service
// worker can only navigate it once the browser installs a new worker, which some devices
// never do. But the page still fetches our vendor bundles: Supabase and Sentry when it
// loads, jsPDF and PptxGenJS when it exports. Each bundle carries this guard, stamped by
// the build with the page builds of its deployment, so the first fresh bundle an old page
// receives reloads it onto the current deployment. Like pwa-controller.js, it never
// reloads over an open dialog or a focused field, and a page that comes back still old
// (an offline fallback from the cache) is not reloaded again for the same deployment.
(function (global) {
  "use strict";

  const RELOADED_KEY = "st-james-deployment-reloaded";

  function editing(document) {
    if (document.querySelector("dialog[open]")) return true;
    const active = document.activeElement;
    return Boolean(active && (active.isContentEditable
      || ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)));
  }

  function readReloaded(storage) {
    try {
      return storage?.getItem(RELOADED_KEY) || null;
    } catch {
      return null;
    }
  }

  function writeReloaded(storage, value) {
    try {
      storage?.setItem(RELOADED_KEY, value);
    } catch {
      // Storage refused: the reload still happens, at worst once more.
    }
  }

  // Returns what happened: "unknown" (not an application page), "current",
  // "reloaded" (already attempted for this deployment), "reloading", or "waiting"
  // (behind, but something is being edited; reloads when the page is next shown or
  // the dialog closes).
  function reloadIfBehind({
    builds,
    window = global,
    document = window.document,
    location = window.location,
    storage = window.sessionStorage,
  }) {
    const build = window.MASS_PLANNER_BUILD;
    if (typeof build !== "string" || !Array.isArray(builds) || !document || !location) {
      return "unknown";
    }
    if (builds.includes(build)) return "current";
    const deployment = builds.join(",");
    if (readReloaded(storage) === deployment) return "reloaded";

    function attempt() {
      if (document.visibilityState !== "visible" || editing(document)) return false;
      writeReloaded(storage, deployment);
      location.reload();
      return true;
    }
    if (attempt()) return "reloading";

    function retry() {
      if (!attempt()) return;
      document.removeEventListener("visibilitychange", retry);
      document.removeEventListener("close", retry, true);
    }
    document.addEventListener("visibilitychange", retry);
    // `close` does not bubble; a capturing listener still sees every dialog close.
    document.addEventListener("close", retry, true);
    return "waiting";
  }

  const api = Object.freeze({ reloadIfBehind });
  global.DeploymentGuard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
