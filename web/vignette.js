(function () {
  "use strict";

  const Debug = window.OneMinuteDebug;

  function createVignette({
    element,
    screenPosition,
    firstReadableChapterId,
    debug = false,
    isOpen,
    isRead,
    onOpen,
  }) {
    let active = null;
    let lastShowKey = "";

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char]));
    }

    function chapterFor(marker, chapterId) {
      return marker?.chapters?.find((chapter) => chapter.id === chapterId) || null;
    }

    function isChapterForMarker(marker, chapterId) {
      return !!chapterId && !!marker?.chapterIds?.includes(chapterId);
    }

    function resolve(marker, requestedChapterId = null) {
      if (isChapterForMarker(marker, requestedChapterId)) return requestedChapterId;
      if (active?.marker === marker && isChapterForMarker(marker, active.chapterId)) return active.chapterId;
      return firstReadableChapterId(marker);
    }

    function display(marker, chapterId) {
      const resolvedChapterId = resolve(marker, chapterId);
      const chapter = chapterFor(marker, resolvedChapterId);
      const chapterIndex = Math.max(0, marker.chapterIds.indexOf(resolvedChapterId));
      return {
        ...marker,
        chapterId: resolvedChapterId,
        chapterIndex: chapterIndex + 1,
        chapterTotal: marker.chapterIds.length,
        heure: chapter?.heure || marker.heure,
        read: isRead(resolvedChapterId),
      };
    }

    function htmlFor(marker) {
      const [city, ...rest] = marker.lieu.split(",");
      const country = rest.join(",").trim();
      const title = country
        ? `${escapeHtml(city.trim())},<br>${escapeHtml(country)},<br>${escapeHtml(marker.heure)}`
        : `${escapeHtml(marker.lieu)},<br><br>${escapeHtml(marker.heure)}`;
      const progress = marker.chapterTotal > 1
        ? `<div class="point-progress"><span class="${marker.read ? "is-read" : "is-open"}">${marker.chapterIndex}</span>/<span>${marker.chapterTotal}</span></div>`
        : "";
      return `${title}${progress}`;
    }

    function chapterState(chapterId) {
      if (isRead(chapterId)) return "lu";
      if (isOpen(chapterId)) return "ouvert";
      return "fermé";
    }

    function textFor(marker) {
      const [city, ...rest] = marker.lieu.split(",");
      const country = rest.join(",").trim();
      return country
        ? `${city.trim()},\n${country},\n${marker.heure}`
        : `${marker.lieu},\n\n${marker.heure}`;
    }

    function show(marker, chapterId, { pinned = false } = {}) {
      const resolvedChapterId = resolve(marker, chapterId);
      if (!resolvedChapterId || !element) return null;
      active = {
        marker,
        chapterId: resolvedChapterId,
        pinned,
        open: () => onOpen(resolvedChapterId, marker),
      };
      const visibleMarker = display(marker, resolvedChapterId);
      console.info(`OneMinute vignette ${resolvedChapterId} (${visibleMarker.chapterIndex}/${visibleMarker.chapterTotal})`);
      const showKey = `${marker.id}:${resolvedChapterId}`;
      if (showKey !== lastShowKey) {
        Debug?.log("Vignette", "show", {
          chapterId: resolvedChapterId,
          index: visibleMarker.chapterIndex,
          total: visibleMarker.chapterTotal,
          lieu: marker.lieu,
        });
        lastShowKey = showKey;
      }
      setDebugChapterLinks(marker, resolvedChapterId);
      element.innerHTML = htmlFor(visibleMarker);
      element.dataset.chapterId = resolvedChapterId;
      element.classList.add("is-visible");
      position();
      return active;
    }

    function setDebugChapterLinks(marker, activeChapterId) {
      if (!debug) return;
      Debug?.setChapterLinks({
        lieu: marker.lieu,
        activeChapterId,
        chapters: (marker.chapters || []).map((chapter, index) => ({
          id: chapter.id,
          label: `${index + 1}/${marker.chapterIds.length} ${chapter.id} ${chapterState(chapter.id)}`,
        })),
        onOpen: (chapterId) => onOpen(chapterId, marker),
      });
    }

    function hide() {
      active = null;
      element?.classList.remove("is-visible");
      if (element) delete element.dataset.chapterId;
    }

    function position() {
      if (!element || !active?.marker) return;
      const point = screenPosition(active.marker);
      if (!point) {
        element.classList.remove("is-visible");
        return;
      }
      element.style.left = `${point.x}px`;
      element.style.top = `${point.y}px`;
    }

    function contains(target) {
      return !!element?.contains(target);
    }

    element?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    element?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      active?.open();
    });

    return {
      active: () => active,
      chapterId: () => active?.chapterId || null,
      contains,
      display,
      element,
      hide,
      htmlFor,
      isActiveMarker: (marker) => active?.marker === marker,
      marker: () => active?.marker || null,
      position,
      resolve,
      show,
      textFor,
    };
  }

  window.OneMinuteVignette = { createVignette };
})();
