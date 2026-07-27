// Keeps the document fixed behind native dialogs and restores its exact scroll position.
(function (global) {
  "use strict";

  function create({ window, document }) {
    let pageScrollY = null;
    let listening = false;

    function open(dialog) {
      if (pageScrollY === null) {
        pageScrollY = window.scrollY;
        document.body.style.setProperty("--modal-page-top", `-${pageScrollY}px`);
        document.documentElement.classList.add("modal-open");
      }
      dialog.showModal();
    }

    function restore() {
      if (document.querySelector("dialog[open]") || pageScrollY === null) return;
      const scrollY = pageScrollY;
      pageScrollY = null;
      document.documentElement.classList.remove("modal-open");
      document.body.style.removeProperty("--modal-page-top");
      window.scrollTo(0, scrollY);
    }

    function onClose() {
      window.requestAnimationFrame(restore);
    }

    function start() {
      if (listening) return;
      document.addEventListener("close", onClose, true);
      listening = true;
    }

    function stop() {
      if (!listening) return;
      document.removeEventListener("close", onClose, true);
      listening = false;
    }

    return Object.freeze({ open, restore, start, stop });
  }

  const api = Object.freeze({ create });
  global.ModalController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
