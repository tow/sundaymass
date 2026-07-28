// Fetches private lyrics on demand and opens a print-to-PDF widescreen slideshow.
(function (global) {
  "use strict";

  function create({
    button,
    status,
    parts,
    presentation,
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
      preparingMessage: "Preparing slides…",
      errorMessage: "Could not create slides. Try again.",
      errorLogLabel: "Could not create lyrics slides",
      async build({ assignments, values, date, setStatus }) {
        const markup = presentation.renderSlides({
          date,
          celebration: values.day,
          meta: values.meta,
          assignments,
        });
        setStatus("Choose \"Save as PDF\" in the print dialog.");
        printController.printCustom(markup, "lyrics-slides");
        setStatus("Slides sent to print.", "success");
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
  global.LyricsSlidesController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
