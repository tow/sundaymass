// Coordinates the public, unsaved YouTube practice queue for the selected Mass.
(function (global) {
  "use strict";

  function create({
    elements,
    parts,
    getSongs,
    queueBuilder,
    openModal,
    createQueueButton,
  }) {
    let latest = null;

    function currentQueue() {
      latest = queueBuilder.build({ parts, songs: getSongs() });
      return latest;
    }

    function availabilityText(queue) {
      if (!queue.assignedCount) return "No songs selected";
      if (!queue.playableCount) return "No videos available";
      return `${queue.playableCount} of ${queue.assignedCount} available`;
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

    function select(index) {
      const queue = latest || currentQueue();
      const source = queueBuilder.embedUrl(queue.items, index);
      if (!source) return;
      elements.player.src = source;
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
      elements.player.removeAttribute("src");
    }

    function close() {
      elements.dialog.close();
    }

    function render() {
      const queue = currentQueue();
      elements.launch.disabled = queue.playableCount === 0;
      elements.availability.textContent = availabilityText(queue);
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
