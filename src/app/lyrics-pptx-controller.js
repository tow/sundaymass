// Fetches private lyrics on demand and downloads a client-side PowerPoint deck.
(function (global) {
  "use strict";

  function defaultLoader(document) {
    return import(new URL("./vendor/pptxgenjs.js", document.baseURI).href)
      .then(module => module.default);
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
    isEditor,
    isOnline,
    loadPptx = () => defaultLoader(document),
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
