// Browser-only PWA installation and service-worker wiring with testable dependencies.
(function (global) {
  "use strict";

  function registerServiceWorker({
    window,
    navigator,
    location,
    url = "./service-worker.js",
  }) {
    if (!navigator.serviceWorker || location.protocol === "file:") return false;
    window.addEventListener("load", () => navigator.serviceWorker.register(url));
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
