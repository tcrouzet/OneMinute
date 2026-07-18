(function () {
  "use strict";

  function createProfileManager({
    button,
    panel,
    closeButton,
    intro,
    note,
    tomes,
    zones,
    history,
    reset,
    chapterLabel,
    openChapter,
  }) {
    function setSpeed() {}

    function update({ readOrder, tomeStats = [], zoneStats = [] }) {
      renderStats(tomes, tomeStats);
      renderStats(zones, zoneStats);
      renderHistory(readOrder);
    }

    async function loadIntro(path, assetUrl) {
      if (!intro || !path) return;
      await loadMarkdownInto(intro, path, assetUrl);
    }

    async function loadNote(path, assetUrl) {
      if (!note || !path) return;
      await loadMarkdownInto(note, path, assetUrl);
    }

    async function loadMarkdownInto(element, path, assetUrl) {
      const text = await fetch(assetUrl ? assetUrl(path) : path, { cache: "no-store" }).then((res) => res.text());
      element.innerHTML = renderInlineMarkdown(text.trim());
      element.querySelectorAll("a").forEach((link) => {
        link.target = "_blank";
        link.rel = "noopener";
      });
    }

    function renderStats(container, stats) {
      if (!container) return;
      container.replaceChildren();
      for (const stat of stats) {
        const item = document.createElement(stat.locked ? "button" : "div");
        item.className = `profile-stat${stat.locked ? " is-locked" : ""}`;
        item.dataset.label = stat.label;
        if (stat.locked) {
          item.type = "button";
          item.dataset.lockReason = stat.lockReason || "Lis 30 % du tome précédent pour débloquer cette zone.";
          item.setAttribute("aria-label", `${stat.label} verrouillé`);
        }
        item.style.setProperty("--stat-progress", `${Math.max(0, Math.min(100, stat.percent))}%`);
        const cover = stat.cover
          ? `<img class="profile-stat-cover" src="${escapeHtml(stat.cover)}" alt="${escapeHtml(stat.label)}">`
          : "";
        item.innerHTML = `
          ${stat.href ? `<a class="profile-stat-cover-link" href="${escapeHtml(stat.href)}" target="_blank" rel="noopener">${cover}</a>` : cover}
          <span class="profile-stat-fill" aria-hidden="true"></span>
          <div class="profile-stat-head">
            <span class="profile-stat-label">${escapeHtml(stat.label)}</span>
            <strong class="profile-stat-percent">${stat.percent}%</strong>
          </div>
        `;
        container.appendChild(item);
      }
    }

    function clearLockReason() {
      panel?.querySelectorAll(".profile-stat.is-explaining").forEach((item) => {
        item.classList.remove("is-explaining");
        const label = item.querySelector(".profile-stat-label");
        if (label) label.textContent = item.dataset.label || label.textContent;
        const value = item.querySelector(".profile-stat-percent");
        if (value) value.hidden = false;
      });
    }

    function showLockReason(item, message) {
      clearLockReason();
      item.classList.add("is-explaining");
      const label = item.querySelector(".profile-stat-label");
      if (label) label.textContent = message;
      const value = item.querySelector(".profile-stat-percent");
      if (value) value.hidden = true;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char]));
    }

    function renderInlineMarkdown(markdown) {
      const placeholders = [];
      let html = escapeHtml(markdown);
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, href) => {
        const token = `@@LINK_${placeholders.length}@@`;
        placeholders.push(`<a href="${href}">${renderInlineEmphasis(label)}</a>`);
        return token;
      });
      html = renderInlineEmphasis(html);
      for (let index = 0; index < placeholders.length; index += 1) {
        html = html.replace(`@@LINK_${index}@@`, placeholders[index]);
      }
      return html;
    }

    function renderInlineEmphasis(html) {
      return html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
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
      clearLockReason();
    }

    function open() {
      panel?.classList.add("is-open");
      panel?.setAttribute("aria-hidden", "false");
    }

    function bind() {
      button?.addEventListener("click", () => {
        const open = panel.classList.toggle("is-open");
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        if (!open) clearLockReason();
      });
      closeButton?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      });
      reset?.element?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm("Réinitialiser la lecture ?")) return;
        reset.action();
      });
      panel?.addEventListener("click", (event) => {
        if (event.target.closest(".profile-stat-cover-link")) return;
        const locked = event.target.closest(".profile-stat.is-locked");
        if (!locked || !panel.contains(locked)) return;
        event.preventDefault();
        event.stopPropagation();
        showLockReason(locked, locked.dataset.lockReason);
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
      open,
      loadIntro,
      loadNote,
      setSpeed,
      update,
    };
  }

  window.OneMinuteProfile = { createProfileManager };
})();
