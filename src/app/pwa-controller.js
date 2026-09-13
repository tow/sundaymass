// Browser-only PWA installation and service-worker wiring with testable dependencies.
(function (global) {
  "use strict";

  // An open page keeps running the code it loaded, and a phone resuming the installed app
  // from the background does not reload it. A later deployment can remove the database
  // calls and asset files that code relies on, so a page left open for weeks fails in
  // ways no fix can reach. So each time the page is shown again, ask for the current
  // service worker. A new worker taking control means a deployment happened, but not
  // that this page is behind it (one opened just before the worker finished installing
  // already runs the new code), so compare builds before reloading, and never reload
  // over an open dialog or a focused field, where it would discard work.
  function registerServiceWorker({
    window,
    navigator,
    location,
    document,
    fetch = window.fetch?.bind(window),
    build = window.MASS_PLANNER_BUILD,
    url = "./service-worker.js",
  }) {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker || location.protocol === "file:") return false;
    let registration = null;
    let deploymentSeen = false;

    function editing() {
      if (document.querySelector("dialog[open]")) return true;
      const active = document.activeElement;
      return Boolean(active && (active.isContentEditable
        || ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)));
    }

    // The service worker answers same-origin requests from its cache first, and its
    // freshly installed cache can still hold the page it is replacing, so ask past it.
    async function deployedBuild() {
      const response = await fetch(`${location.pathname}?build-check=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      return (await response.text()).match(/MASS_PLANNER_BUILD\s*=\s*"([0-9a-f]+)"/)?.[1] || null;
    }

    function reloadIfBehind() {
      if (!deploymentSeen || document.visibilityState !== "visible" || editing()) return;
      deploymentSeen = false;
      deployedBuild().then(current => {
        if (current && current !== build) location.reload();
      }, () => {
        deploymentSeen = true;
      });
    }

    serviceWorker.addEventListener("controllerchange", () => {
      deploymentSeen = true;
      reloadIfBehind();
    });
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
