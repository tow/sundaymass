// Fetches private lyrics on demand and opens an imposed A4 booklet print job.
(function (global) {
  "use strict";

  function create({
    button,
    status,
    parts,
    presentation,
    booklet,
    exportController,
    printController,
    getStore,
    getSongs,
    getDate,
    getValues,
    isEditor,
    isOnline,
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
        const markup = booklet.renderBooklet({
          date,
          celebration: values.day,
          meta: values.meta,
          assignments,
        });
        setStatus("Print double-sided, flip on short edge, actual size; leave printer booklet mode off.");
        printController.printCustom(markup, "lyrics-booklet");
        setStatus("Booklet sent to print.", "success");
      },
    });

    return Object.freeze({
      print: controller.run,
      render: controller.render,
      start: controller.start,
      stop: controller.stop,
    });
  }

  const api = Object.freeze({ create });
  global.LyricsBookletController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
