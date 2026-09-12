// Fetches private lyrics on demand and downloads a client-side widescreen PDF slide deck.
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
      preparingMessage: "Preparing slides…",
      errorMessage: "Could not create the PDF. Try again.",
      errorLogLabel: "Could not create lyrics PDF",
      async build({ assignments, values, date, setStatus }) {
        setStatus("Building PDF…");
        const JsPDF = await loadJsPdf();
        const doc = presentation.buildPdfDoc(JsPDF, {
          date,
          celebration: values.day,
          meta: values.meta,
          assignments,
        });
        doc.save(presentation.pdfFileName(date));
        setStatus("PDF downloaded.", "success");
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
  global.LyricsSlidesController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
