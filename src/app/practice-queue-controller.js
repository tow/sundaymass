// Coordinates the public, unsaved YouTube practice queue for the selected Mass.
(function (global) {
  "use strict";

  function defaultPlayerApiLoader(document) {
    const window = document.defaultView || global;
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (window.__massPlannerYouTubeApi) return window.__massPlannerYouTubeApi;
    window.__massPlannerYouTubeApi = new Promise((resolve, reject) => {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error("YouTube player API unavailable"));
      };
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (existing) return;
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.addEventListener("error", () => reject(new Error("Could not load YouTube player")));
      document.head.append(script);
    });
    return window.__massPlannerYouTubeApi;
  }

  function create({
    elements,
    parts,
    getSongs,
    queueBuilder,
    openModal,
    createQueueButton,
    loadPlayerApi = defaultPlayerApiLoader,
  }) {
    let latest = null;
    let player = null;
    let playerReady = false;
    let requestedIndex = 0;
    let playerGeneration = 0;

    function currentQueue() {
      latest = queueBuilder.build({ parts, songs: getSongs() });
      return latest;
    }

    function availabilityText(queue) {
      return `${queue.playableCount}/${queue.assignedCount}`;
    }

    function availabilityLabel(queue) {
      if (!queue.assignedCount) return "Listen to all: no songs selected";
      if (!queue.playableCount) {
        return `Listen to all: none of ${queue.assignedCount} selected songs have videos`;
      }
      return `Listen to all: ${queue.playableCount} of ${queue.assignedCount} selected songs have videos`;
    }

    function summaryText(queue) {
      const songs = queue.assignedCount === 1 ? "song" : "songs";
      const skipped = queue.missingCount === 1
        ? "1 will be skipped."
        : `${queue.missingCount} will be skipped.`;
      return [
        `${queue.playableCount} of ${queue.assignedCount} selected ${songs} available.`,
        queue.missingCount ? skipped : "",
      ].filter(Boolean).join(" ");
    }

    function defaultQueueButton(item, index, select) {
      const document = elements.list.ownerDocument || global.document;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "practice-queue-item";
      button.dataset.queueIndex = String(index);

      const position = document.createElement("span");
      position.className = "practice-queue-position";
      position.textContent = item.label;
      const title = document.createElement("strong");
      title.textContent = item.title;
      button.append(position, title);
      button.addEventListener("click", () => select(index));
      return button;
    }

    function markCurrent(index) {
      elements.list.children && Array.from(elements.list.children).forEach(
        (button, buttonIndex) => {
          if (button.classList) button.classList.toggle("current", buttonIndex === index);
          if (button.setAttribute && button.removeAttribute) {
            if (buttonIndex === index) button.setAttribute("aria-current", "true");
            else button.removeAttribute("aria-current");
          }
        },
      );
    }

    function syncPlayerIndex(event) {
      const index = Number(event?.target?.getPlaylistIndex?.());
      if (Number.isInteger(index) && index >= 0 && index < (latest?.items.length || 0)) {
        requestedIndex = index;
        markCurrent(index);
      }
    }

    function orderedVideoIds() {
      return (latest?.items || []).map(item => item.videoId);
    }

    function loadOrderedPlaylist(index) {
      player.loadPlaylist({
        playlist: orderedVideoIds(),
        index,
        startSeconds: 0,
      });
    }

    function attachPlayer() {
      const generation = ++playerGeneration;
      const document = elements.list.ownerDocument || global.document;
      loadPlayerApi(document).then(YT => {
        if (generation !== playerGeneration || !latest?.items.length) return;
        player = new YT.Player(elements.player, {
          events: {
            onReady(event) {
              if (generation !== playerGeneration) return;
              player = event.target;
              playerReady = true;
              loadOrderedPlaylist(requestedIndex);
            },
            onStateChange: syncPlayerIndex,
          },
        });
      }).catch(() => {
        player = null;
        playerReady = false;
      });
    }

    function select(index) {
      const queue = latest || currentQueue();
      if (!queue.items[index]) return;
      requestedIndex = index;
      markCurrent(index);
      if (playerReady) {
        loadOrderedPlaylist(index);
        return;
      }
      const origin = elements.list.ownerDocument?.defaultView?.location?.origin || "";
      const source = queueBuilder.embedUrl(queue.items, index, { origin });
      if (!source) return;
      elements.player.src = source;
      attachPlayer();
    }

    function open() {
      const queue = currentQueue();
      if (!queue.playableCount) return;
      elements.summary.textContent = summaryText(queue);
      const makeButton = createQueueButton || defaultQueueButton;
      elements.list.replaceChildren(...queue.items.map(
        (item, index) => makeButton(item, index, select),
      ));
      select(0);
      openModal(elements.dialog);
    }

    function stopPlayback() {
      playerGeneration += 1;
      player?.stopVideo?.();
      player = null;
      playerReady = false;
      elements.player.removeAttribute("src");
    }

    function close() {
      stopPlayback();
      elements.dialog.close();
    }

    function render() {
      const queue = currentQueue();
      elements.launch.disabled = queue.playableCount === 0;
      elements.availability.textContent = availabilityText(queue);
      elements.launch.setAttribute("aria-label", availabilityLabel(queue));
    }

    function start() {
      elements.launch.addEventListener("click", open);
      elements.close.addEventListener("click", close);
      elements.dialog.addEventListener("close", stopPlayback);
      render();
    }

    return Object.freeze({ render, start, open, close });
  }

  const api = Object.freeze({ create });
  global.PracticeQueueController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
