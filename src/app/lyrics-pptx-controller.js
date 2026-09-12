// Fetches private lyrics on demand and downloads a client-side PowerPoint deck.
(function (global) {
  "use strict";

  const failures = global.Failures
    || (typeof require === "function" ? require("../domain/failures.js") : null);


  function defaultLoader(document, importModule, isOnline) {
    const url = global.AppAssets?.url("vendor/pptxgenjs.js", document)
      || new URL("./vendor/pptxgenjs.js", document.baseURI).href;
    return importModule(url).then(module => module.default, cause => {
      // Offline, this is the user's connection and theirs to fix. Online, the very
      // same TypeError is also what a missing or misdeployed bundle produces, and we
      // cannot tell the two apart from here — so it stays a fault and reaches
      // monitoring, because a broken deployment is not something to hide behind a
      // reassuring message about somebody's wifi.
      if (!failures.isModuleFetchFailure(cause) || isOnline()) throw cause;
      throw failures.expected(
        "Export unavailable — you appear to be offline.",
        cause,
      );
    });
  }

  function create({
    button,
    status,
    document,
    parts,
    presentation,
    exportController,
    getStore,
    getSongs,
    getDate,
    getValues,
    canReadLyrics,
    isOnline,
    importModule = url => import(url),
    loadPptx = () => defaultLoader(document, importModule, isOnline),
    logger = console,
  }) {
    const controller = exportController.create({
      button,
      status,
      parts,
      presentation,
      getStore,
      getSongs,
      getDate,
      getValues,
      canReadLyrics,
      isOnline,
      logger,
      preparingMessage: "Preparing lyrics…",
      errorMessage: "Could not create PowerPoint. Try again.",
      errorLogLabel: "Could not create lyrics PowerPoint",
      async build({ assignments, values, date, setStatus }) {
        setStatus("Building PowerPoint…");
        const PptxGenJS = await loadPptx();
        const deck = presentation.buildDeck(PptxGenJS, {
          date,
          celebration: values.day,
          meta: values.meta,
          assignments,
        });
        await deck.writeFile({
          fileName: presentation.fileName(date),
          compression: true,
        });
        setStatus("PowerPoint downloaded.", "success");
      },
    });

    return Object.freeze({
      download: controller.run,
      render: controller.render,
      start: controller.start,
      stop: controller.stop,
    });
  }

  const api = Object.freeze({ create });
  global.LyricsPptxController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
