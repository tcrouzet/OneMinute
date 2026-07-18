(function () {
  "use strict";

  const enabled = new URLSearchParams(window.location.search).has("debug");
  let panel = null;
  let consoleNode = null;
  let drag = null;
  let minimized = false;
  let fullscreen = false;
  const entries = [];
  let currentLinks = null;

  function ensurePanel() {
    if (!enabled || panel) return panel;
    panel = document.createElement("section");
    panel.className = "debug-panel";
    panel.innerHTML = `
      <header class="debug-panel-head" data-debug-drag>
        <span>Debug</span>
        <span class="debug-panel-actions">
          <button type="button" data-debug-minimize>-</button>
          <button type="button" data-debug-fullscreen>□</button>
          <button type="button" data-debug-copy>Copie</button>
        </span>
      </header>
      <div class="debug-console"></div>
    `;
    document.body.appendChild(panel);
    consoleNode = panel.querySelector(".debug-console");
    bindDrag(panel.querySelector("[data-debug-drag]"));
    bindActions();
    return panel;
  }

  function bindActions() {
    panel.querySelector("[data-debug-minimize]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      minimized = !minimized;
      panel.classList.toggle("is-minimized", minimized);
    });
    panel.querySelector("[data-debug-fullscreen]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      fullscreen = !fullscreen;
      panel.classList.toggle("is-fullscreen", fullscreen);
      if (fullscreen) {
        panel.style.left = "";
        panel.style.top = "";
        panel.style.right = "";
        panel.style.bottom = "";
      }
    });
    panel.querySelector("[data-debug-copy]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = consoleNode?.innerText || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopy(text);
      }
    });
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function bindDrag(handle) {
    handle?.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      if (fullscreen) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle?.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      panel.style.left = `${Math.min(maxLeft, Math.max(0, event.clientX - drag.x))}px`;
      panel.style.top = `${Math.min(maxTop, Math.max(0, event.clientY - drag.y))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    handle?.addEventListener("pointerup", () => {
      drag = null;
    });
    handle?.addEventListener("pointercancel", () => {
      drag = null;
    });
  }

  function format(value) {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function log(scope, message, data = null) {
    if (!enabled) return;
    ensurePanel();
    if (scope !== "Vignette" && scope !== "Debug") currentLinks = null;
    entries.push({
      scope,
      message: data == null ? format(message) : `${format(message)}\n${format(data)}`,
    });
    renderOutput();
  }

  function clear() {
    if (!enabled) return;
    ensurePanel();
    entries.length = 0;
    currentLinks = null;
    renderOutput();
  }

  function setChapterLinks({ lieu, chapters = [], activeChapterId = null, onOpen }) {
    if (!enabled) return;
    ensurePanel();
    currentLinks = { lieu, chapters, activeChapterId, onOpen };
    renderOutput();
  }

  function renderLinks() {
    if (!currentLinks) return;
    const title = document.createElement("div");
    title.className = "debug-line debug-links-title";
    title.textContent = `Liens ${currentLinks.lieu || "Chapitres"}`;
    consoleNode.appendChild(title);
    for (const chapter of currentLinks.chapters) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `debug-link${chapter.id === currentLinks.activeChapterId ? " is-active" : ""}`;
      button.textContent = chapter.label || chapter.id;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        log("Debug", "click chapitre", { chapterId: chapter.id });
        currentLinks?.onOpen?.(chapter.id);
      });
      consoleNode.appendChild(button);
    }
  }

  function renderOutput() {
    ensurePanel();
    consoleNode.textContent = "";
    renderLinks();
    if (currentLinks && entries.length) {
      consoleNode.appendChild(document.createTextNode("\n"));
    }
    for (const entry of entries) {
      const block = document.createElement("div");
      block.className = "debug-line";
      block.textContent = `[${entry.scope}] ${entry.message}`;
      consoleNode.appendChild(block);
    }
  }

  window.OneMinuteDebug = {
    enabled,
    clear,
    log,
    setChapterLinks,
  };
})();
