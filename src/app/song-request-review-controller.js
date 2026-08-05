// Shows the public pending song-request queue; editors accept or decline.
(function (global) {
  "use strict";

  function create({
    elements,
    parts,
    getStore,
    isEditor,
    isOnline,
    openModal,
    onStatus,
    formatDate,
    youtubeWatchUrl,
    logger,
  }) {
    let pending = [];

    function partLabel(key) {
      return parts.find(part => part.key === key)?.label || key;
    }

    function targetText(request) {
      return [
        request.part ? partLabel(request.part) : "",
        request.sunday ? formatDate(request.sunday) : "",
        request.songId ? "In the song library" : "New song",
      ].filter(Boolean).join(" · ");
    }

    function canAssign(request) {
      return Boolean(request.songId && request.sunday && request.part);
    }

    function renderList() {
      const document = elements.list.ownerDocument || global.document;
      elements.empty.hidden = pending.length > 0;
      elements.list.replaceChildren(...pending.map(request => {
        const item = document.createElement("div");
        item.className = "song-request-item";

        const heading = document.createElement("strong");
        heading.textContent = request.songTitle || request.title;
        item.append(heading);

        const target = document.createElement("small");
        target.textContent = targetText(request);
        item.append(target);

        const watchUrl = youtubeWatchUrl(request.youtubeVideoId);
        if (watchUrl) {
          const listen = document.createElement("a");
          listen.className = "listen-link";
          listen.href = watchUrl;
          listen.target = "_blank";
          listen.rel = "noopener";
          listen.textContent = "Listen ↗";
          item.append(listen);
        }

        if (request.note) {
          const note = document.createElement("p");
          note.className = "song-request-note";
          note.textContent = request.note;
          item.append(note);
        }

        if (isEditor()) {
          const actions = document.createElement("div");
          actions.className = "song-request-actions";
          const accept = document.createElement("button");
          accept.type = "button";
          accept.className = "primary";
          accept.textContent = canAssign(request) ? "Accept and assign" : "Mark accepted";
          accept.addEventListener("click", () => resolve(request, "accepted"));
          const decline = document.createElement("button");
          decline.type = "button";
          decline.textContent = "Decline";
          decline.addEventListener("click", () => resolve(request, "declined"));
          actions.append(accept, decline);
          item.append(actions);
        }
        return item;
      }));
    }

    async function refresh() {
      const store = getStore();
      try {
        pending = store?.listSongRequests ? await store.listSongRequests() : [];
      } catch (error) {
        pending = [];
        logger.warn("Could not load song requests", error);
      }
      elements.launch.textContent = `Song requests (${pending.length})`;
      elements.launch.hidden = !isEditor() && pending.length === 0;
      if (elements.dialog.open) renderList();
    }

    async function resolve(request, status) {
      elements.error.textContent = "";
      if (!isOnline()) {
        elements.error.textContent = "Reviewing requests requires an internet connection.";
        return;
      }
      try {
        if (status === "accepted" && canAssign(request)) {
          await getStore().assignSong(request.sunday, request.part, request.songId);
        }
        await getStore().resolveSongRequest(request.id, status);
        onStatus(status === "accepted" ? "Request accepted" : "Request declined", "saved");
        await refresh();
        renderList();
      } catch (error) {
        logger.error("Could not resolve song request", error);
        elements.error.textContent = "Could not update the request. Please try again.";
      }
    }

    async function open() {
      elements.error.textContent = "";
      await refresh();
      renderList();
      openModal(elements.dialog);
    }

    function close() {
      if (elements.dialog.open) elements.dialog.close();
    }

    function start() {
      elements.launch.addEventListener("click", open);
      elements.close.addEventListener("click", close);
    }

    return Object.freeze({ start, open, close, refresh });
  }

  const api = Object.freeze({ create });
  global.SongRequestReviewController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
