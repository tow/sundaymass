// Fetches private lyrics on demand and downloads an imposed A4 booklet PDF.
(function (global) {
  "use strict";

  function defaultLoader(document) {
    return import(new URL("./vendor/jspdf.js", document.baseURI).href)
      .then(module => module.jsPDF);
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
    isEditor,
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
      isEditor,
      isOnline,
      logger,
      preparingMessage: "Preparing booklet…",
      errorMessage: "Could not create booklet. Try again.",
      errorLogLabel: "Could not create lyrics booklet",
      async build({ assignments, values, date, setStatus }) {
        setStatus("Building booklet PDF…");
        const JsPDF = await loadJsPdf();
        const doc = booklet.buildPdf(JsPDF, {
          date,
          celebration: values.day,
          meta: values.meta,
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

  const api = Object.freeze({ create });
  global.LyricsBookletController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
