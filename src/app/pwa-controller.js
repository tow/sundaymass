// Browser-only PWA installation and service-worker wiring with testable dependencies.
(function (global) {
  "use strict";

  // An open page keeps running the code it loaded, and a phone resuming the installed app
  // from the background does not reload it, so after a deployment it would call RPCs and
  // request files that no longer exist. Each time the page is shown again it asks for the
  // current service worker. Each new worker announces its deployment's builds and reloads
  // any page that does not answer (see src/service-worker.js). Answering is this page
  // taking that on itself: it reloads if its build is not among them, but never over an
  // open dialog or a focused field, where reloading would discard work.
  function registerServiceWorker({
    window,
    navigator,
    location,
    document,
    build = window.MASS_PLANNER_BUILD,
    url = "./service-worker.js",
  }) {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker || location.protocol === "file:") return false;
    let registration = null;
    let behind = false;

    function editing() {
      if (document.querySelector("dialog[open]")) return true;
      const active = document.activeElement;
      return Boolean(active && (active.isContentEditable
        || ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)));
    }

    function reloadIfBehind() {
      if (!behind || document.visibilityState !== "visible" || editing()) return;
      behind = false;
      location.reload();
    }

    serviceWorker.addEventListener("message", event => {
      if (event.data?.type !== "deployment") return;
      event.ports?.[0]?.postMessage("updating");
      if (!event.data.builds?.includes(build)) behind = true;
      reloadIfBehind();
    });
    serviceWorker.startMessages?.();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      reloadIfBehind();
      registration?.update().catch(() => {});
    });
    window.addEventListener("load", () => serviceWorker.register(url)
      .then(value => { registration = value || null; }));
    return true;
  }

  function createInstallController({
    window,
    navigator,
    button,
    showIosInstructions,
  }) {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
    let deferredPrompt = null;
    let started = false;

    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      deferredPrompt = event;
      if (!standalone) button.hidden = false;
    }

    async function onInstallClick() {
      if (deferredPrompt) {
        const prompt = deferredPrompt;
        prompt.prompt();
        await prompt.userChoice;
        deferredPrompt = null;
        button.hidden = true;
      } else if (ios) {
        showIosInstructions();
      }
    }

    function onInstalled() {
      button.hidden = true;
      deferredPrompt = null;
    }

    function start() {
      if (started) return;
      if (ios && !standalone) button.hidden = false;
      window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.addEventListener("appinstalled", onInstalled);
      button.addEventListener("click", onInstallClick);
      started = true;
    }

    function stop() {
      if (!started) return;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      button.removeEventListener("click", onInstallClick);
      deferredPrompt = null;
      started = false;
    }

    return Object.freeze({ start, stop });
  }

  const api = Object.freeze({ registerServiceWorker, createInstallController });
  global.PwaController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
