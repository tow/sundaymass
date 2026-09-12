// Fetches private lyrics on demand and downloads an imposed A4 booklet PDF.
(function (global) {
  "use strict";

  const failures = global.Failures
    || (typeof require === "function" ? require("../domain/failures.js") : null);


  function defaultLoader(document, importModule, isOnline) {
    const url = global.AppAssets?.url("vendor/jspdf.js", document)
      || new URL("./vendor/jspdf.js", document.baseURI).href;
    return importModule(url).then(module => module.jsPDF, cause => {
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

  function buildDocument({ JsPDF, booklet, date, values, assignments }) {
    return booklet.buildPdf(JsPDF, {
      date,
      celebration: values.day,
      meta: values.meta,
      assignments,
    });
  }

  function create({
    button,
    status,
    document,
    parts,
    presentation,
    booklet,
    exportController,
    getStore,
    getSongs,
    getDate,
    getValues,
    canReadLyrics,
    isOnline,
    importModule = url => import(url),
    loadJsPdf = () => defaultLoader(document, importModule, isOnline),
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
      preparingMessage: "Preparing booklet…",
      errorMessage: "Could not create booklet. Try again.",
      errorLogLabel: "Could not create lyrics booklet",
      async build({ assignments, values, date, setStatus }) {
        setStatus("Building booklet PDF…");
        const JsPDF = await loadJsPdf();
        const doc = buildDocument({
          JsPDF,
          booklet,
          date,
          values,
          assignments,
        });
        doc.save(booklet.fileName(date));
        setStatus(
          "Booklet downloaded. Print double-sided, flip on short edge, actual size; leave printer booklet mode off.",
          "success",
        );
      },
    });

    return Object.freeze({
      download: controller.run,
      render: controller.render,
      start: controller.start,
      stop: controller.stop,
    });
  }

  const api = Object.freeze({ buildDocument, create });
  global.LyricsBookletController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
