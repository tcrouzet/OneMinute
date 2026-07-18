(function () {
  "use strict";

  function createProfileManager({
    button,
    panel,
    closeButton,
    xp,
    speed,
    history,
    reset,
    chapterLabel,
    openChapter,
  }) {
    function setSpeed(text) {
      if (speed) speed.textContent = text;
    }

    function update({ readCount, readOrder }) {
      if (xp) xp.textContent = String(readCount * 10);
      renderHistory(readOrder);
    }

    function renderHistory(readOrder) {
      if (!history) return;
      history.replaceChildren();
      for (const chapterId of readOrder) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.chapterId = chapterId;
        button.textContent = chapterLabel(chapterId);
        history.appendChild(button);
      }
    }

    function close() {
      panel?.classList.remove("is-open");
      panel?.setAttribute("aria-hidden", "true");
    }

    function bind() {
      button?.addEventListener("click", () => {
        const open = panel.classList.toggle("is-open");
        panel.setAttribute("aria-hidden", open ? "false" : "true");
      });
      closeButton?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      });
      reset?.element?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        reset.action();
      });
      history?.addEventListener("click", (event) => {
        const item = event.target.closest("button[data-chapter-id]");
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        openChapter(item.dataset.chapterId);
      });
    }

    return {
      bind,
      close,
      setSpeed,
      update,
    };
  }

  window.OneMinuteProfile = { createProfileManager };
})();
