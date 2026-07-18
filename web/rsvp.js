(function () {
  "use strict";

  const RSVP_FACTOR_MS = 1250;
  const RSVP_K = 3;
  const RSVP_PUNCTUATION_MS = RSVP_FACTOR_MS / 5;
  const RSVP_PUNCTUATION_RE = /[.,;:!?…‥"'“”‘’«»()[\]{}<>/\\|¿¡、。；：！？，—–-]/g;
  const RSVP_PUNCTUATION_ONLY_RE = /^[.,;:!?…‥"'“”‘’«»()[\]{}<>/\\|¿¡、。；：！？，—–-]+$/;
  const Debug = window.OneMinuteDebug;
  let chapterPaths = {};
  let assetUrl = (path) => path;
  let lastInstruction = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function splitIntoGroups(text) {
    const rawTokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const words = [];
    let prefix = "";
    for (let token of rawTokens) {
      if (/^[—–-]+$/.test(token)) {
        prefix += token;
        continue;
      }
      token = prefix + token;
      prefix = "";
      if (RSVP_PUNCTUATION_ONLY_RE.test(token) && words.length) {
        words[words.length - 1] += token;
        continue;
      }
      words.push(token);
    }
    if (prefix && words.length) words[words.length - 1] += prefix;
    return attachShortFunctionWords(words);
  }

  function configure(options = {}) {
    chapterPaths = options.chapterPaths || chapterPaths;
    assetUrl = options.assetUrl || assetUrl;
  }

  async function loadChapter(chapterId) {
    const path = chapterPaths[chapterId];
    if (!path) throw new Error(`Chapitre introuvable: ${chapterId}`);
    const instruction = {
      requestedChapterId: chapterId,
    };
    Debug?.log("RSVP", "consigne recue", instruction);
    console.info(`OneMinute RSVP load ${chapterId} -> ${path}`);
    const chapter = await fetch(assetUrl(path), { cache: "no-store" }).then((res) => res.json());
    lastInstruction = {
      ...instruction,
      path,
      loadedChapterId: chapter.id,
      textStart: String(chapter.texte || "").slice(0, 80),
    };
    if (chapter.id !== chapterId) {
      throw new Error(`Mauvais chapitre charge: ${chapterId} -> ${chapter.id}`);
    }
    return chapter;
  }

  async function prepareChapter(chapterId) {
    const chapter = await loadChapter(chapterId);
    const groups = splitIntoGroups(chapter.texte || "");
    if (lastInstruction) {
      lastInstruction.groupCount = groups.length;
      lastInstruction.firstGroup = groups[0] || "";
      Debug?.log("RSVP", "chapitre prepare", lastInstruction);
    }
    return { chapter, groups };
  }

  function instruction() {
    return lastInstruction ? { ...lastInstruction } : null;
  }

  function attachShortFunctionWords(words) {
    const grouped = [];
    for (let index = 0; index < words.length; index += 1) {
      const token = words[index];
      if (shouldAttachToNext(token) && index < words.length - 1) {
        grouped.push(`${token} ${words[index + 1]}`);
        index += 1;
      } else {
        grouped.push(token);
      }
    }
    return grouped;
  }

  function shouldAttachToNext(token) {
    const text = plainWord(token);
    if (/[.,;:!?…‥。；：！？，]$/.test(text)) return false;
    const lexical = text.replace(RSVP_PUNCTUATION_RE, "");
    return lexical && estimateSyllables(lexical) <= 1;
  }

  function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\^([^^]+)\^/g, "<sup>$1</sup>");
    html = html.replace(/([A-Za-zÀ-ÿ0-9])\^([0-9]+)\b/g, "$1<sup>$2</sup>");
    return html;
  }

  function renderFocusWord(word) {
    const html = renderInlineMarkdown(word);
    const targetIndex = optimalRecognitionIndex(html);
    let output = "";
    let visibleIndex = 0;
    for (let index = 0; index < html.length;) {
      if (html[index] === "<") {
        const end = html.indexOf(">", index);
        const token = end === -1 ? html.slice(index) : html.slice(index, end + 1);
        output += token;
        index += token.length;
        continue;
      }
      if (html[index] === "&") {
        const end = html.indexOf(";", index);
        const token = end === -1 ? html[index] : html.slice(index, end + 1);
        output += renderVisibleToken(token, targetIndex, visibleIndex);
        visibleIndex += 1;
        index += token.length;
        continue;
      }
      const token = html[index];
      if (/\s/.test(token)) {
        output += token;
      } else {
        output += renderVisibleToken(token, targetIndex, visibleIndex);
        visibleIndex += 1;
      }
      index += 1;
    }
    return `<span class="reader-word">${output}</span>`;
  }

  function renderVisibleToken(token, targetIndex, visibleIndex) {
    if (targetIndex >= 0 && visibleIndex === targetIndex) return `<span class="focus-letter">${token}</span>`;
    if (isPunctuationToken(token)) return `<span class="punctuation-letter">${token}</span>`;
    return token;
  }

  function isPunctuationToken(token) {
    if (token.startsWith("&")) return false;
    return RSVP_PUNCTUATION_ONLY_RE.test(token);
  }

  function optimalRecognitionIndex(html) {
    const length = visibleLength(html);
    if (length <= 1) return -1;
    if (length <= 5) return 1;
    if (length <= 9) return 2;
    if (length <= 13) return 3;
    return Math.max(1, Math.min(length - 1, Math.round(length * 0.35) - 1));
  }

  function visibleLength(html) {
    let length = 0;
    for (let index = 0; index < html.length;) {
      if (html[index] === "<") {
        const end = html.indexOf(">", index);
        index = end === -1 ? html.length : end + 1;
        continue;
      }
      if (html[index] === "&") {
        const end = html.indexOf(";", index);
        index = end === -1 ? index + 1 : end + 1;
        length += 1;
        continue;
      }
      if (!/\s/.test(html[index])) length += 1;
      index += 1;
    }
    return length;
  }

  function wordDuration(word, syllablesPerSecond) {
    const syllables = estimateSyllables(word);
    const rawDuration = RSVP_FACTOR_MS * syllables / (syllables + RSVP_K)
      + punctuationWeight(word) * RSVP_PUNCTUATION_MS;
    return rawDuration * (5 / syllablesPerSecond);
  }

  function punctuationWeight(word) {
    const text = plainWord(word).replace(/([A-Za-zÀ-ÿ])['’\-]([A-Za-zÀ-ÿ])/g, "$1$2");
    const matches = text.match(RSVP_PUNCTUATION_RE);
    return matches ? matches.length : 0;
  }

  function estimateSyllables(word) {
    const cleaned = plainWord(word)
      .toLowerCase()
      .replace(/^[^a-zàâäéèêëîïôöùûüÿçœæ]+|[^a-zàâäéèêëîïôöùûüÿçœæ]+$/gi, "");
    if (!cleaned) return 1;
    const parts = cleaned.match(/[aàâäæeéèêëiîïoôöœuùûüyÿ]+/g) || [];
    let count = parts.length;
    const keepsFinalE = /[bcdfghjklmnpqrstvwxz]re(s)?$/i.test(cleaned);
    if (!keepsFinalE && cleaned.length > 2 && /e(s|nt)?$/.test(cleaned) && count > 1) count -= 1;
    return Math.max(1, count);
  }

  function plainWord(word) {
    return word
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\^([^^]+)\^/g, "$1")
      .replace(/([A-Za-zÀ-ÿ0-9])\^([0-9]+)\b/g, "$1$2");
  }

  window.OneMinuteRSVP = {
    configure,
    estimateSyllables,
    instruction,
    loadChapter,
    plainWord,
    prepareChapter,
    renderInlineMarkdown,
    renderFocusWord,
    splitIntoGroups,
    wordDuration,
  };
})();
