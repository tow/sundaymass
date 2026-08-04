// Fetches private lyrics on demand and downloads a client-side widescreen PDF slide deck.
(function (global) {
  "use strict";

  function defaultLoader(document) {
    const url = global.AppAssets?.url("vendor/jspdf.js", document)
      || new URL("./vendor/jspdf.js", document.baseURI).href;
    return import(url)
      .then(module => module.jsPDF);
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
    loadJsPdf = () => defaultLoader(document),
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
