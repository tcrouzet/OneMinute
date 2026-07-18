(async function () {
  "use strict";

  const BUILD = window.ONEMINUTE_DEV_VERSION || "dev";
  const POINTS_PATH = "data/map-points.json";
  const CHAPTER_PATHS = {};
  const STORAGE_KEY = "oneminute.progress.v2";
  const SEARCH_PARAMS = new URLSearchParams(window.location.search);
  const DEBUG = SEARCH_PARAMS.has("debug");
  const EARTH_RADIUS_METERS = 6378137;
  const EARTH_POINTS_MAX_VISIBLE_HEIGHT = 42000000;
  const VERSAILLES = { lon: 2.1204, lat: 48.8049 };
  const NEAR_SPACE_VISIBLE_HEIGHT = 18000000;
  const DEEP_SPACE_VISIBLE_HEIGHT = 750000000;
  const CAMERA_MAX_HEIGHT = 1600000000;
  const INTRO_TARGET_HEIGHT = 14000;
  const POPUP_AUTO_HEIGHT = 22000;
  const POST_READ_ZOOM_OUT_FACTOR = 18;
  const POST_READ_ZOOM_OUT_MAX_HEIGHT = 9000000;
  const READING_TOTAL_CHAPTERS = 380;
  const TOME_UNLOCK_THRESHOLD = 0.3;
  const TOME_IDS = [1, 2, 3, 4];
  const TOME_COVERS = {
    1: "assets/oneminute-1.webp",
    2: "assets/oneminue2.webp",
    3: "assets/oneminute3.webp",
    4: "assets/oneminute4.webp",
  };
  const TOME_SHOP_URLS = {
    1: "https://pvh-editions.com/product/one-minute-t1-la-communion-des-analystes-papier",
    2: "https://pvh-editions.com/product/one-minute-t2-le-manifeste-hypo-papier",
    3: "https://pvh-editions.com/product/one-minute-t3-la-controverse-omega-papier",
    4: "https://pvh-editions.com/product/one-minute-t4-le-musee-des-replicants-epub",
  };
  const ZONE_IDS = ["Europe", "Amérique", "Asie", "Afrique", "Océanie", "Espace"];
  const BUTTON_ZOOM_IN_RATIO = 0.62;
  const BUTTON_ZOOM_OUT_RATIO = 1.25;
  const WHEEL_ZOOM_RATIO = 0.0042;
  const PINCH_ZOOM_RATIO = 1.35;
  const RSVP = window.OneMinuteRSVP;
  const Links = window.OneMinuteLinks;
  const Vignette = window.OneMinuteVignette;
  const Profile = window.OneMinuteProfile;
  const Debug = window.OneMinuteDebug;
  const IS_TOUCH_DEVICE = window.matchMedia?.("(pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;

  const mapRoot = document.querySelector(".game-map");
  const introCurtain = document.querySelector("#introCurtain");
  const tooltip = document.querySelector("#pointTooltip");
  const pointHitLayer = document.querySelector("#pointHitLayer");
  const mapTitle = document.querySelector("#mapTitle");
  const profileTitle = document.querySelector("#profileTitle");
  const reader = document.querySelector("#reader");
  const readerPlace = document.querySelector("#readerPlace");
  const readerWords = document.querySelector("#readerWords");
  const readerVertical = document.querySelector("#readerVertical");
  const readerVerticalText = document.querySelector("#readerVerticalText");
  const readerSeek = document.querySelector("#readerSeek");
  const readerSpeed = document.querySelector("#readerSpeed");
  const speedLabel = document.querySelector("#speedLabel");
  const readerClose = document.querySelector("#readerClose");
  const readerMode = document.querySelector("#readerMode");
  const readerNext = document.querySelector("#readerNext");
  const shareButton = document.querySelector("#shareButton");
  const profileButton = document.querySelector("#profileButton");
  const profilePanel = document.querySelector("#profilePanel");
  const profileClose = document.querySelector("#profileClose");
  const profileIntro = document.querySelector("#profileIntro");
  const profileTomes = document.querySelector("#profileTomes");
  const profileZones = document.querySelector("#profileZones");
  const profileHistory = document.querySelector("#profileHistory");
  const profileReset = document.querySelector("#profileReset");
  const zoomIn = document.querySelector("#zoomIn");
  const zoomOut = document.querySelector("#zoomOut");
  const markers = [];
  const markerByChapterId = new Map();
  const chapterById = new Map();
  let linkManager = null;
  let vignette = null;
  let profileManager = null;
  let initialOpenChapterIds = [];
  let selectedMarker = null;
  let readerRequestId = 0;
  const linkHistory = [];
  let historyReturnActive = false;
  let introPlaying = true;
  let popupPinned = false;
  let suppressAutoPopup = false;
  const zoomState = { cameraHeight: 260000000 };
  let totalChapterCount = 0;

  console.info(`OneMinute map build ${BUILD}`);
  const progress = { read: new Set(), readOrder: [], open: new Set(), blocked: new Set(), unlockEdges: [], knownEdges: [] };
  let lastChapterId = null;
  const rsvp = {
    chapter: null,
    marker: null,
    groups: [],
    index: 0,
    playing: false,
    timer: null,
    syllablesPerSecond: 6,
    mode: "rsvp",
    seeking: false,
    resumeAfterSeek: false,
    readerFontSize: null,
    displayedFirstGroupFor: null,
  };

  if (SEARCH_PARAMS.has("reset") || DEBUG) {
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!window.Cesium) {
    throw new Error("CesiumJS n'est pas charge. Le globe tuilé ne peut pas demarrer.");
  }
  if (!RSVP) {
    throw new Error("Le module RSVP n'est pas charge.");
  }
  if (!Links) {
    throw new Error("Le module de liens n'est pas charge.");
  }
  if (!Vignette) {
    throw new Error("Le module vignette n'est pas charge.");
  }
  if (!Profile) {
    throw new Error("Le module profil n'est pas charge.");
  }

  Cesium.Ion.defaultAccessToken = "";

  const satelliteProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    { enablePickFeatures: false }
  );

  const viewer = new Cesium.Viewer("globe", {
    baseLayer: new Cesium.ImageryLayer(satelliteProvider),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    vrButton: false,
  });

  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = CAMERA_MAX_HEIGHT;
  viewer.scene.screenSpaceCameraController.enableZoom = true;
  viewer.camera.percentageChanged = 0.001;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-35, 28, 260000000),
  });
  syncZoomState();
  linkManager = Links.createLinkManager({
    Cesium,
    viewer,
    markerByChapterId,
    pickTolerance: IS_TOUCH_DEVICE ? 24 : 10,
  });
  vignette = Vignette.createVignette({
    element: tooltip,
    screenPosition: markerScreenPosition,
    firstReadableChapterId,
    debug: DEBUG,
    isOpen: (chapterId) => progress.open.has(chapterId) && !progress.read.has(chapterId),
    isRead: (chapterId) => progress.read.has(chapterId),
    onOpen: openChapterForMarker,
  });
  profileManager = Profile.createProfileManager({
    button: profileButton,
    panel: profilePanel,
    closeButton: profileClose,
    intro: profileIntro,
    tomes: profileTomes,
    zones: profileZones,
    history: profileHistory,
    reset: { element: profileReset, action: resetProgress },
    chapterLabel,
    openChapter: (chapterId) => flyToChapter(chapterId, {
      allowRead: true,
      showChapterId: chapterId,
      showOutgoingLinks: true,
    }),
  });
  profileManager.loadIntro("assets/profile-intro.md", assetUrl);

  const pointPrimitives = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      read: [...progress.read],
      readOrder: progress.readOrder,
      open: [...progress.open],
      blocked: [...progress.blocked],
      knownEdges: progress.knownEdges,
      lastChapterId,
      syllablesPerSecond: rsvp.syllablesPerSecond,
      readerMode: rsvp.mode,
    }));
    updateProfile();
  }

  function updateReadingScore(animate = false) {
    const total = Math.max(READING_TOTAL_CHAPTERS, totalChapterCount || chapterById.size || 0);
    const read = progress.read.size;
    const percent = total ? Math.max(0, Math.min(100, (read / total) * 100)) : 0;
    for (const title of [mapTitle, profileTitle]) {
      if (!title) continue;
      const progressValue = `${percent}%`;
      if (animate) {
        const pulsePercent = Math.min(100, Math.max(percent + 18, percent * 4.4));
        title.style.setProperty("--reading-progress", `${pulsePercent}%`);
        window.setTimeout(() => {
          title.style.setProperty("--reading-progress", progressValue);
        }, 1250);
      } else {
        title.style.setProperty("--reading-progress", progressValue);
      }
      title.title = `${read} / ${total}`;
    }
    if (animate) {
      for (const title of [mapTitle, profileTitle]) {
        if (!title) continue;
        title.classList.remove("is-bumped");
        void title.offsetWidth;
        title.classList.add("is-bumped");
      }
    }
  }

  function assetUrl(path) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}dev=${encodeURIComponent(BUILD)}`;
  }

  function chapterSort(a, b) {
    const [ta, ca] = String(a).split("_").map(Number);
    const [tb, cb] = String(b).split("_").map(Number);
    return ta - tb || ca - cb;
  }

  function chapterTome(chapterId) {
    const tome = Number(String(chapterId).split("_")[0]);
    return Number.isFinite(tome) ? tome : 0;
  }

  function tomeChapterIds(tome) {
    return [...chapterById.values()]
      .filter((chapter) => chapter.tome === tome || chapterTome(chapter.id) === tome)
      .map((chapter) => chapter.id);
  }

  function tomeProgressRatio(tome) {
    const ids = tomeChapterIds(tome);
    if (!ids.length) return 0;
    return ids.filter((chapterId) => progress.read.has(chapterId)).length / ids.length;
  }

  function tomeUnlocked(tome) {
    if (tome <= 1) return true;
    return tomeProgressRatio(tome - 1) >= TOME_UNLOCK_THRESHOLD;
  }

  function chapterTomeUnlocked(chapterId) {
    return tomeUnlocked(chapterTome(chapterId));
  }

  function chapterBlocked(chapterId) {
    return progress.blocked.has(chapterId) && !progress.read.has(chapterId) && !progress.open.has(chapterId);
  }

  function chapterLinkVisible(chapterId) {
    return progress.open.has(chapterId) || progress.read.has(chapterId);
  }

  function edgeLinkVisible(edge) {
    return chapterCanBeMapped(edge.from)
      && chapterCanBeMapped(edge.to)
      && chapterLinkVisible(edge.from)
      && chapterLinkVisible(edge.to);
  }

  function pointStatus(point, read) {
    const chapters = point.chapters || [];
    if (chapters.some((chapter) => progress.open.has(chapter.id) && !read.has(chapter.id))) return "open";
    if (chapters.some((chapter) => chapterBlocked(chapter.id))) return "blocked";
    if (chapters.some((chapter) => read.has(chapter.id))) return "read";
    return "locked";
  }

  function pointColor(status) {
    if (status === "read") return Cesium.Color.fromCssColorString("#ffd75e");
    if (status === "open") return Cesium.Color.fromCssColorString("#62dd72");
    if (status === "blocked") return Cesium.Color.fromCssColorString("#c2193b");
    return Cesium.Color.fromCssColorString("#ff3355");
  }

  function pointSize(marker, status) {
    return marker?.type === "space" ? 9 : 8;
  }

  function pointEyeOffset(status) {
    return Cesium.Cartesian3.ZERO;
  }

  function spaceScale(point) {
    const lieu = (point.lieu || "").toLowerCase();
    if (lieu.includes("mars") || lieu.includes("kasei")) return 46;
    if (lieu.includes("vesta")) return 78;
    if (lieu.includes("éros") || lieu.includes("astero") || lieu.includes("astéro")) return 64;
    if (lieu.includes("oort")) return 180;
    if (lieu.includes("lagrange")) return 2.2;
    return 1.22;
  }

  function spaceVisibleHeight(point) {
    return spaceScale(point) > 8 ? DEEP_SPACE_VISIBLE_HEIGHT : NEAR_SPACE_VISIBLE_HEIGHT;
  }

  function spacePosition(point) {
    const theta = Cesium.Math.toRadians(point.theta || 0);
    const phi = Cesium.Math.toRadians(point.phi || 0);
    const radius = EARTH_RADIUS_METERS * spaceScale(point);
    return new Cesium.Cartesian3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
  }

  function addPoint(point, read) {
    const status = pointStatus(point, read);
    const position = point.type === "space"
      ? spacePosition(point)
      : Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0);
    const marker = {
      id: point.id,
      type: point.type,
      lieu: point.lieu,
      heure: point.heure,
      zone: point.zone,
      status,
      position,
      lat: point.lat,
      lon: point.lon,
      chapters: point.chapters || [],
      chapterIds: point.chapter_ids || [],
      minCameraHeight: point.type === "space" ? spaceVisibleHeight(point) : 0,
      maxCameraHeight: point.type === "space" ? CAMERA_MAX_HEIGHT : EARTH_POINTS_MAX_VISIBLE_HEIGHT,
    };
    for (const chapter of marker.chapters) {
      chapterById.set(chapter.id, chapter);
    }
    marker.primitive = pointPrimitives.add({
      position,
      pixelSize: pointSize(marker, status),
      color: pointColor(status),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.78),
      outlineWidth: 1.5,
      eyeOffset: pointEyeOffset(status),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: marker,
      show: false,
    });
    marker.hitButton = createHitButton(marker);
    markers.push(marker);
    for (const chapterId of marker.chapterIds) {
      markerByChapterId.set(chapterId, marker);
    }
  }

  function createHitButton(marker) {
    if (!pointHitLayer) return null;
    const button = document.createElement("button");
    let popupShownOnPointerDown = false;
    button.type = "button";
    button.className = "point-hit";
    button.setAttribute("aria-label", `Lire ${marker.lieu}`);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!markerInteractive(marker)) return;
      historyReturnActive = false;
      if (!firstReadableChapterId(marker)) {
        showRememberedLinksForMarker(marker);
        return;
      }
      popupShownOnPointerDown = !vignette.isActiveMarker(marker);
      showReadableMarker(marker, null, true);
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!markerInteractive(marker)) return;
      historyReturnActive = false;
      if (!firstReadableChapterId(marker)) {
        showRememberedLinksForMarker(marker);
        return;
      }
      if (popupShownOnPointerDown) {
        popupShownOnPointerDown = false;
        return;
      }
      showReadableMarker(marker, null, true);
    });
    pointHitLayer.appendChild(button);
    return button;
  }

  async function loadPoints() {
    const state = loadState();
    const payload = await fetch(assetUrl(POINTS_PATH), { cache: "no-store" }).then((res) => res.json());
    Object.assign(CHAPTER_PATHS, payload.chapter_paths || {});
    RSVP.configure({ chapterPaths: CHAPTER_PATHS, assetUrl });
    progress.read = new Set(state.read || []);
    progress.readOrder = Array.isArray(state.readOrder)
      ? state.readOrder.filter((chapterId) => progress.read.has(chapterId))
      : [...progress.read].sort(chapterSort);
    initialOpenChapterIds = payload.initial_open_chapter_ids || [];
    lastChapterId = state.lastChapterId || progress.readOrder.at(-1) || null;
    progress.open = new Set((Array.isArray(state.open) && state.open.length ? state.open : initialOpenChapterIds) || []);
    progress.blocked = new Set(state.blocked || []);
    progress.unlockEdges = [];
    progress.knownEdges = Array.isArray(state.knownEdges) ? state.knownEdges : [];
    const savedSpeed = Number.isFinite(state.syllablesPerSecond)
      ? state.syllablesPerSecond
      : state.wordsPerSecond;
    if (Number.isFinite(savedSpeed)) {
      rsvp.syllablesPerSecond = Math.max(2, Math.min(12, Number(savedSpeed)));
      readerSpeed.value = String(rsvp.syllablesPerSecond);
    }
    if (state.readerMode === "vertical") {
      rsvp.mode = "vertical";
    }
    applyReaderMode();
    for (const point of payload.points || []) {
      addPoint(point, progress.read);
    }
    totalChapterCount = chapterById.size;
    let stateChanged = enforceTomeLocks();
    for (const chapterId of progress.read) {
      unlockNextChapters(chapterId, markerByChapterId.get(chapterId), false);
      rememberKnownOutgoingLinks(chapterById.get(chapterId));
    }
    stateChanged = enforceTomeLocks() || stateChanged;
    stateChanged = promoteBlockedChapters().length > 0 || stateChanged;
    refreshMarkerStatuses();
    redrawUnlockLines();
    if ((progress.read.size && !Array.isArray(state.knownEdges)) || stateChanged) saveState();
    else updateProfile();
  }

  function bindZoomButtons() {
    bindZoomButton(zoomIn, -BUTTON_ZOOM_IN_RATIO);
    bindZoomButton(zoomOut, BUTTON_ZOOM_OUT_RATIO);
    mapRoot?.addEventListener("wheel", handleWheelZoom, { passive: false, capture: true });
    if (!IS_TOUCH_DEVICE) {
      mapRoot?.addEventListener("gesturechange", handleGestureZoom, { passive: false, capture: true });
    }
    viewer.camera.changed.addEventListener(syncZoomState);
  }

  function bindZoomButton(button, ratio) {
    button.addEventListener("pointerdown", stopUiEvent);
    button.addEventListener("pointerup", stopUiEvent);
    button.addEventListener("click", (event) => {
      stopUiEvent(event);
      zoomCamera(ratio);
    });
  }

  function stopUiEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function syncZoomState() {
    const height = viewer.camera.positionCartographic.height;
    if (Number.isFinite(height)) zoomState.cameraHeight = Math.max(80, Math.min(CAMERA_MAX_HEIGHT, height));
  }

  function zoomCamera(ratio) {
    syncZoomState();
    const height = zoomState.cameraHeight;
    const amount = Math.max(80, height * Math.abs(ratio));
    if (ratio < 0) viewer.camera.zoomIn(amount);
    else viewer.camera.zoomOut(amount);
    syncZoomState();
  }

  function handleWheelZoom(event) {
    if (zoomIgnoredTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
    const delta = event.deltaY * unit * (event.ctrlKey ? PINCH_ZOOM_RATIO : 1);
    const ratio = Math.max(-0.9, Math.min(0.9, delta * WHEEL_ZOOM_RATIO));
    if (Math.abs(ratio) < 0.002) return;
    zoomCamera(ratio);
  }

  function handleGestureZoom(event) {
    if (zoomIgnoredTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const scale = Number(event.scale) || 1;
    const ratio = Math.max(-0.9, Math.min(0.9, (1 - scale) * PINCH_ZOOM_RATIO));
    if (Math.abs(ratio) < 0.004) return;
    zoomCamera(ratio);
  }

  function zoomIgnoredTarget(target) {
    return !!target?.closest?.(".zoom-controls, .map-title, .profile-panel, .debug-panel, .point-tooltip, #reader");
  }

  function markerVisible(marker, cameraHeight, occluder) {
    if (cameraHeight < marker.minCameraHeight || cameraHeight > marker.maxCameraHeight) return false;
    if (marker.type !== "space" && cameraHeight < 25000) {
      const camera = viewer.camera.positionCartographic;
      const markerCartographic = Cesium.Cartographic.fromDegrees(marker.lon, marker.lat);
      const geodesic = new Cesium.EllipsoidGeodesic(camera, markerCartographic);
      return geodesic.surfaceDistance <= Math.max(12000, cameraHeight * 2.2);
    }
    if (marker.type !== "space" && !occluder.isPointVisible(marker.position)) return false;
    return true;
  }

  function updateMarkers() {
    const cameraHeight = viewer.camera.positionCartographic.height;
    const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, viewer.camera.positionWC);
    const linkedMarkers = activeLinkedMarkers();
    const spaceFocus = currentSpaceFocusMarker();

    for (const marker of markers) {
      if (spaceFocus && marker.type !== "space" && !linkedMarkers.has(marker)) {
        marker.baseVisible = false;
      } else {
        marker.baseVisible = markerVisible(marker, cameraHeight, occluder) || linkedMarkers.has(marker);
      }
      marker.primitive.show = marker.baseVisible && !vignette.isActiveMarker(marker);
    }
    updateHitTargets();
    updateAutoPopup(cameraHeight);
  }

  function activeLinkedMarkers() {
    const linked = new Set();
    for (const edge of progress.unlockEdges) {
      if (!edgeLinkVisible(edge)) continue;
      const fromMarker = markerByChapterId.get(edge.from);
      const toMarker = markerByChapterId.get(edge.to);
      if (fromMarker) linked.add(fromMarker);
      if (toMarker) linked.add(toMarker);
    }
    return linked;
  }

  function currentSpaceFocusMarker() {
    const marker = vignette.marker?.() || rsvp.marker || null;
    return marker?.type === "space" ? marker : null;
  }

  function updateHitTargets() {
    for (const marker of markers) {
      if (!marker.hitButton) continue;
      const visible = marker.baseVisible
        && markerInteractive(marker)
        && !vignette.isActiveMarker(marker)
        && !historyReturnActive
        && !introPlaying
        && !reader.classList.contains("is-open");
      const screenPosition = visible ? markerScreenPosition(marker) : null;
      if (!screenPosition) {
        marker.hitButton.hidden = true;
        continue;
      }
      marker.hitButton.hidden = false;
      marker.hitButton.style.left = `${screenPosition.x}px`;
      marker.hitButton.style.top = `${screenPosition.y}px`;
    }
  }

  function showPopup(marker, _screenPosition, pinned = false, chapterId = null) {
    if (introPlaying) return;
    showChapterPopup(marker, vignette.resolve(marker, chapterId), pinned);
  }

  function showReadableMarker(marker, screenPosition, pinned = false) {
    if (markerHasKnownLinks(marker, true)) {
      showActiveLinksForPoints([marker]);
    }
    showPopup(marker, screenPosition, pinned);
  }

  function forceShowPopup(marker, pinned = false, chapterId = null) {
    showChapterPopup(marker, vignette.resolve(marker, chapterId), pinned);
  }

  function showChapterPopup(marker, chapterId, pinned = false) {
    if (!chapterId) return;
    suppressAutoPopup = false;
    popupPinned = pinned;
    selectedMarker = marker;
    hidePopupLabels();
    vignette.show(marker, chapterId, { pinned });
    marker.primitive.show = false;
    updateHitTargets();
  }

  function hidePopup() {
    popupPinned = false;
    selectedMarker = null;
    vignette.hide();
    hidePopupLabels();
  }

  function hidePopupLabels(exceptMarker = null) {
    for (const marker of markers) {
      if (marker === exceptMarker) continue;
      marker.primitive.show = !!marker.baseVisible;
    }
  }

  function markerScreenPosition(marker) {
    const normalize = (position) => {
      if (!position) return null;
      const dpr = window.devicePixelRatio || 1;
      if (dpr > 1 && (position.x > window.innerWidth || position.y > window.innerHeight)) {
        return new Cesium.Cartesian2(position.x / dpr, position.y / dpr);
      }
      return position;
    };
    if (Cesium.SceneTransforms.worldToWindowCoordinates) {
      return normalize(Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, marker.position));
    }
    if (marker.primitive?.computeScreenSpacePosition) {
      return normalize(marker.primitive.computeScreenSpacePosition(viewer.scene));
    }
    return normalize(viewer.scene.cartesianToCanvasCoordinates?.(marker.position) || null);
  }

  function nearestMarker(screenPosition) {
    let best = null;
    let bestDistance = Infinity;
    for (const marker of markers) {
      if (!marker.baseVisible && !vignette.isActiveMarker(marker)) continue;
      const markerPosition = markerScreenPosition(marker);
      if (!markerPosition) continue;
      const dx = markerPosition.x - screenPosition.x;
      const dy = markerPosition.y - screenPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 48 && distance < bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    }
    return best;
  }

  function pickMarker(screenPosition) {
    return directPickedMarker(screenPosition) || nearestMarker(screenPosition);
  }

  function directPickedMarker(screenPosition) {
    const picked = viewer.scene.pick(screenPosition);
    const marker = picked?.id || picked?.primitive?.id;
    if (marker?.lieu) return marker;
    return null;
  }

  function pickedUnlockTarget(screenPosition) {
    return linkManager.pickedTarget(screenPosition);
  }

  function pickedUnlockLink(screenPosition) {
    return linkManager.pickedLink(screenPosition);
  }

  function firstReadableChapterId(marker) {
    const ids = marker.chapterIds || [];
    return ids.find((id) => CHAPTER_PATHS[id] && progress.open.has(id) && !progress.read.has(id)) || null;
  }

  function markerHasKnownLinks(marker, refresh = false) {
    if (!marker) return false;
    if (refresh) rebuildKnownEdgesFromRead();
    return progress.knownEdges.some((edge) => {
      if (!edgeLinkVisible(edge)) return false;
      return markerByChapterId.get(edge.from) === marker || markerByChapterId.get(edge.to) === marker;
    });
  }

  function markerInteractive(marker) {
    return !!firstReadableChapterId(marker) || markerHasKnownLinks(marker);
  }

  function showRememberedLinksForMarker(marker) {
    if (!marker) return;
    hidePopup();
    showActiveLinksForPoints([marker]);
    saveState();
    updateHitTargets();
  }

  function markerGroundDistance(marker) {
    if (marker.type === "space" || marker.lat == null || marker.lon == null) return Number.POSITIVE_INFINITY;
    const camera = viewer.camera.positionCartographic;
    const markerCartographic = Cesium.Cartographic.fromDegrees(marker.lon, marker.lat);
    return new Cesium.EllipsoidGeodesic(camera, markerCartographic).surfaceDistance;
  }

  function nearestReadableMarkerToCamera() {
    let best = null;
    let bestDistance = Infinity;
    for (const marker of markers) {
      if (!marker.baseVisible || !firstReadableChapterId(marker)) continue;
      const distance = markerGroundDistance(marker);
      if (distance < bestDistance) {
        best = marker;
        bestDistance = distance;
      }
    }
    return best && bestDistance <= 18000 ? best : null;
  }

  function updateAutoPopup(cameraHeight) {
    if (suppressAutoPopup) return;
    if (introPlaying || popupPinned || reader.classList.contains("is-open")) {
      if (popupPinned && selectedMarker) vignette.position();
      return;
    }
    if (vignette.active()) return;
    if (cameraHeight > POPUP_AUTO_HEIGHT) {
      hidePopup();
      return;
    }
    const marker = nearestReadableMarkerToCamera();
    if (!marker) {
      hidePopup();
      return;
    }
    const screenPosition = markerScreenPosition(marker);
    if (screenPosition) showPopup(marker, screenPosition);
  }

  function showInitialChapterPopup() {
    const marker = markerByChapterId.get(initialOpenChapterIds[0]);
    if (!marker || !firstReadableChapterId(marker)) return;
    introPlaying = false;
    marker.baseVisible = true;
    forceShowPopup(marker, true);
    updateHitTargets();
  }

  function bindOverlayRendering() {
    viewer.scene.postRender.addEventListener(() => {
      updateMarkers();
      updatePopupAnchor();
    });
  }

  function updatePopupAnchor() {
    if (!vignette.active()) return;
    vignette.position();
  }

  function bindTooltip() {
    let lastRoutedClickAt = 0;
    const routeMapClick = (position) => {
      const now = performance.now();
      if (now - lastRoutedClickAt < 90) return;
      lastRoutedClickAt = now;
      if (introPlaying) return;
      const marker = directPickedMarker(position);
      if (marker) {
        historyReturnActive = false;
        if (!firstReadableChapterId(marker)) {
          if (markerHasKnownLinks(marker, true)) showRememberedLinksForMarker(marker);
          return;
        }
        showReadableMarker(marker, markerScreenPosition(marker) || position, true);
        return;
      }
      const link = pickedUnlockLink(position);
      if (link?.to) {
        historyReturnActive = false;
        flyToLinkedChapter(link);
        return;
      }
      const nearbyMarker = nearestMarker(position);
      if (nearbyMarker) {
        historyReturnActive = false;
        if (!firstReadableChapterId(nearbyMarker)) {
          if (markerHasKnownLinks(nearbyMarker, true)) showRememberedLinksForMarker(nearbyMarker);
          return;
        }
        showReadableMarker(nearbyMarker, markerScreenPosition(nearbyMarker) || position, true);
        return;
      }
      hidePopup();
    };

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      routeMapClick(movement.position);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.scene.canvas.addEventListener("pointerleave", () => {
      if (!popupPinned) hidePopup();
    });

    viewer.scene.canvas.addEventListener("click", (event) => {
      const rect = viewer.scene.canvas.getBoundingClientRect();
      const position = new Cesium.Cartesian2(event.clientX - rect.left, event.clientY - rect.top);
      routeMapClick(position);
    });

    window.addEventListener("pointerup", (event) => {
      if (introPlaying || reader.classList.contains("is-open")) return;
      if (vignette.contains(event.target) || zoomIgnoredTarget(event.target)) return;
      const rect = viewer.scene.canvas.getBoundingClientRect();
      const position = new Cesium.Cartesian2(event.clientX - rect.left, event.clientY - rect.top);
      routeMapClick(position);
    }, true);
  }

  function updateSpeedLabel() {
    const duration = rsvp.groups.length ? ` - ${formatChapterDuration()}` : "";
    const speed = formatSpeed(rsvp.syllablesPerSecond);
    if (speedLabel) speedLabel.textContent = `${speed} syll/s${duration}`;
    profileManager?.setSpeed(`${speed} syll/s`);
  }

  function formatChapterDuration() {
    const seconds = rsvp.groups.reduce((total, word) => total + RSVP.wordDuration(word, rsvp.syllablesPerSecond) / 1000, 0);
    const roundedSeconds = Math.max(1, Math.round(seconds));
    const minutes = Math.floor(roundedSeconds / 60);
    const remainingSeconds = roundedSeconds % 60;
    if (!minutes) return `${remainingSeconds}"`;
    return `${minutes}'${String(remainingSeconds).padStart(2, "0")}"`;
  }

  function formatSpeed(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function updateProfile() {
    profileManager?.update({
      readCount: progress.read.size,
      totalCount: Math.max(READING_TOTAL_CHAPTERS, totalChapterCount || chapterById.size || 0),
      readOrder: progress.readOrder,
      tomeStats: buildTomeStats(),
      zoneStats: buildZoneStats(),
    });
    updateReadingScore();
    updateSpeedLabel();
  }

  function buildTomeStats() {
    return TOME_IDS.map((tome) => {
      const ids = tomeChapterIds(tome);
      return {
        label: `Tome ${tome}`,
        percent: progressPercent(ids),
        locked: !tomeUnlocked(tome),
        cover: assetUrl(TOME_COVERS[tome]),
        href: TOME_SHOP_URLS[tome],
        lockReason: tome <= 1 ? "" : `Lis 30 % du Tome ${tome - 1} pour débloquer cette zone.`,
      };
    });
  }

  function buildZoneStats() {
    const idsByZone = new Map(ZONE_IDS.map((zone) => [zone, new Set()]));
    for (const marker of markers) {
      const zone = markerZone(marker);
      const ids = idsByZone.get(zone) || idsByZone.get("Océanie");
      for (const chapterId of marker.chapterIds || []) ids.add(chapterId);
    }
    return ZONE_IDS.map((zone) => ({
      label: zone,
      percent: progressPercent([...idsByZone.get(zone)]),
      locked: false,
    }));
  }

  function progressPercent(chapterIds) {
    if (!chapterIds.length) return 0;
    const readCount = chapterIds.filter((chapterId) => progress.read.has(chapterId)).length;
    return Math.round((readCount / chapterIds.length) * 100);
  }

  function markerZone(marker) {
    if (marker?.type === "space") return "Espace";
    const zone = String(marker?.zone || "").toLowerCase();
    if (zone.includes("europe")) return "Europe";
    if (zone.includes("amérique") || zone.includes("amerique") || zone.includes("caraïbes") || zone.includes("caraibes")) return "Amérique";
    if (zone.includes("asie") || zone.includes("moyen-orient")) return "Asie";
    if (zone.includes("afrique")) return "Afrique";
    if (zone.includes("espace")) return "Espace";
    return "Océanie";
  }

  function chapterLabel(chapterId) {
    const chapter = chapterById.get(chapterId);
    const marker = markerByChapterId.get(chapterId);
    if (!chapter && !marker) return "";
    return [chapter?.lieu || marker?.lieu, chapter?.heure || marker?.heure].filter(Boolean).join(", ");
  }

  function resetProgress() {
    pauseReader();
    progress.read = new Set();
    progress.readOrder = [];
    progress.open = new Set(initialOpenChapterIds);
    progress.blocked = new Set();
    progress.unlockEdges = [];
    progress.knownEdges = [];
    lastChapterId = null;
    suppressAutoPopup = false;
    rsvp.chapter = null;
    rsvp.marker = null;
    rsvp.mode = "rsvp";
    applyReaderMode();
    profileManager?.close();
    closeReader();
    hidePopup();
    refreshMarkerStatuses();
    redrawUnlockLines();
    saveState();
    restartIntroFromBlack();
  }

  function restartIntroFromBlack() {
    introCurtain?.classList.add("is-visible");
    introPlaying = true;
    selectedMarker = null;
    popupPinned = false;
    suppressAutoPopup = false;
    hidePopup();
    viewer.camera.cancelFlight();
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-35, 28, 260000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
    });
    syncZoomState();
    updateMarkers();
    window.setTimeout(() => {
      introCurtain?.classList.remove("is-visible");
      playIntro();
    }, 460);
  }

  function setReaderProgress() {
    if (!readerSeek || rsvp.seeking) return;
    const total = Math.max(rsvp.groups.length - 1, 0);
    readerSeek.max = String(total);
    readerSeek.value = String(Math.max(0, Math.min(total, rsvp.index)));
  }

  function stopReaderTimer() {
    if (rsvp.timer) window.clearTimeout(rsvp.timer);
    rsvp.timer = null;
  }

  function nextReaderGroup() {
    stopReaderTimer();
    if (!rsvp.playing) return;
    if (rsvp.index >= rsvp.groups.length) {
      completeReader();
      return;
    }
    showReaderWord(rsvp.index);
    rsvp.index += 1;
    rsvp.timer = window.setTimeout(nextReaderGroup, RSVP.wordDuration(rsvp.groups[rsvp.index - 1], rsvp.syllablesPerSecond));
  }

  function showReaderWord(index) {
    const word = rsvp.groups[index] || "";
    applyReaderFontSize();
    readerWords.innerHTML = RSVP.renderFocusWord(word);
    if (index === 0 && rsvp.chapter?.id && rsvp.displayedFirstGroupFor !== rsvp.chapter.id) {
      rsvp.displayedFirstGroupFor = rsvp.chapter.id;
      Debug?.log("Reader", "premier groupe affiche", {
        chapterId: rsvp.chapter.id,
        word,
        domText: readerWords.innerText,
      });
    }
    setReaderProgress();
  }

  function applyReaderFontSize() {
    if (rsvp.readerFontSize) readerWords.style.fontSize = `${rsvp.readerFontSize}px`;
    else readerWords.style.fontSize = "";
  }

  function setReaderFontForChapter() {
    readerWords.style.fontSize = "";
    const styles = window.getComputedStyle(readerWords);
    const maxSize = Number.parseFloat(styles.fontSize);
    const minSize = 24;
    const availableWidth = Math.max(220, readerWords.clientWidth || window.innerWidth * 0.88);
    const context = document.createElement("canvas").getContext("2d");
    const family = styles.fontFamily;
    const weight = styles.fontWeight || "700";
    let size = maxSize;
    while (size > minSize) {
      context.font = `${weight} ${size}px ${family}`;
      const widest = rsvp.groups.reduce((max, word) => {
        const width = context.measureText(RSVP.plainWord(word)).width;
        return Math.max(max, width);
      }, 0);
      if (widest <= availableWidth * 0.96) break;
      size -= 2;
    }
    rsvp.readerFontSize = size < maxSize ? size : null;
    applyReaderFontSize();
  }

  function applyReaderMode() {
    const vertical = rsvp.mode === "vertical";
    reader?.classList.toggle("is-vertical", vertical);
    if (readerMode) {
      readerMode.setAttribute("aria-label", vertical ? "Lecture RSVP" : "Lecture verticale");
      readerMode.title = vertical ? "Lecture RSVP" : "Lecture verticale";
    }
    if (vertical) pauseReader();
  }

  function toggleReaderMode() {
    rsvp.mode = rsvp.mode === "vertical" ? "rsvp" : "vertical";
    applyReaderMode();
    saveState();
    if (!rsvp.chapter) return;
    if (rsvp.mode === "vertical") {
      renderVerticalReader();
    } else {
      readerWords.textContent = "";
      rsvp.index = verticalReaderIndex();
      setReaderProgress();
      playReader();
    }
  }

  function renderVerticalReader() {
    if (!readerVertical || !readerVerticalText || !rsvp.chapter) return;
    readerVerticalText.innerHTML = renderVerticalText(rsvp.chapter.texte || "");
    const ratio = rsvp.groups.length > 1 ? Math.max(0, Math.min(1, rsvp.index / (rsvp.groups.length - 1))) : 0;
    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, readerVertical.scrollHeight - readerVertical.clientHeight);
      readerVertical.scrollTop = maxScroll * ratio;
    });
  }

  function verticalReaderIndex() {
    if (!readerVertical || rsvp.groups.length <= 1) return rsvp.index;
    const maxScroll = Math.max(0, readerVertical.scrollHeight - readerVertical.clientHeight);
    if (!maxScroll) return rsvp.index;
    const ratio = Math.max(0, Math.min(1, readerVertical.scrollTop / maxScroll));
    return Math.max(0, Math.min(rsvp.groups.length - 1, Math.round(ratio * (rsvp.groups.length - 1))));
  }

  function renderVerticalText(text) {
    return String(text)
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((paragraph) => `<p>${RSVP.renderInlineMarkdown(paragraph.replace(/\s*\n\s*/g, " ").trim())}</p>`)
      .join("");
  }

  function playReader() {
    if (rsvp.mode === "vertical") return;
    rsvp.playing = true;
    nextReaderGroup();
  }

  function pauseReader() {
    rsvp.playing = false;
    stopReaderTimer();
  }

  function setMarkerStatus(marker, status) {
    marker.status = status;
    updateMarkerVisual(marker);
  }

  function updateMarkerVisual(marker) {
    marker.primitive.color = pointColor(marker.status);
    marker.primitive.pixelSize = pointSize(marker, marker.status);
    marker.primitive.eyeOffset = pointEyeOffset(marker.status);
  }

  function refreshMarkerStatuses() {
    for (const marker of markers) {
      const status = pointStatus(marker, progress.read);
      marker.status = status;
      updateMarkerVisual(marker);
    }
  }

  function unlockNextChapters(chapterId, sourceMarker, recordEdges = true) {
    const chapter = chapterById.get(chapterId);
    const nextLinks = chapter?.next_chapter_links?.length
      ? chapter.next_chapter_links
      : (chapter?.next_chapter_ids || []).map((nextId) => ({ to: nextId, type: "chapitre", label: "chapitre" }));
    const newlyOpened = [];

    for (const link of nextLinks) {
      const nextId = link.to;
      if (!chapterCanBeMapped(nextId)) {
        Debug?.log("Map", "lien ignore sans pastille", { from: chapterId, to: nextId, label: link.label || link.type || "" });
        continue;
      }
      if (recordEdges) rememberUnlockEdge(chapterId, nextId, link);
      else rememberKnownEdge(chapterId, nextId, link);
      if (progress.read.has(nextId)) continue;
      if (!chapterTomeUnlocked(nextId)) {
        progress.blocked.add(nextId);
        continue;
      }
      if (!progress.open.has(nextId)) {
        progress.blocked.delete(nextId);
        progress.open.add(nextId);
        newlyOpened.push(nextId);
      }
    }

    if (newlyOpened.length && sourceMarker) {
      selectedMarker = sourceMarker;
    }
    return newlyOpened;
  }

  function promoteBlockedChapters() {
    const newlyOpened = [];
    for (const chapterId of [...progress.blocked]) {
      if (progress.read.has(chapterId) || !chapterCanBeMapped(chapterId)) {
        progress.blocked.delete(chapterId);
        continue;
      }
      if (!chapterTomeUnlocked(chapterId)) continue;
      progress.blocked.delete(chapterId);
      if (!progress.open.has(chapterId)) {
        progress.open.add(chapterId);
        newlyOpened.push(chapterId);
      }
    }
    return newlyOpened;
  }

  function enforceTomeLocks() {
    let changed = false;
    for (const chapterId of [...progress.open]) {
      if (progress.read.has(chapterId) || chapterTomeUnlocked(chapterId)) continue;
      progress.open.delete(chapterId);
      progress.blocked.add(chapterId);
      changed = true;
    }
    return changed;
  }

  function chapterCanBeMapped(chapterId) {
    return !!CHAPTER_PATHS[chapterId] && !!chapterById.get(chapterId) && !!markerByChapterId.get(chapterId);
  }

  function rememberUnlockEdge(from, to, link = {}) {
    linkManager.remember(progress.knownEdges, from, to, link);
    linkManager.remember(progress.unlockEdges, from, to, link);
  }

  function rememberKnownEdge(from, to, link = {}) {
    linkManager.remember(progress.knownEdges, from, to, link);
  }

  function redrawUnlockLines() {
    linkManager.redraw(progress.unlockEdges, edgeLinkVisible);
  }

  function redrawInspectableLinks() {
    linkManager.redraw(progress.unlockEdges, edgeLinkVisible);
  }

  function redrawRestoredLinks() {
    linkManager.redraw(progress.unlockEdges, edgeLinkVisible);
  }

  function showOutgoingLinksForChapter(chapterId) {
    const chapter = chapterById.get(chapterId);
    progress.unlockEdges = [];
    rememberOutgoingLinks(chapter);
    redrawInspectableLinks();
  }

  function rememberOutgoingLinks(chapter) {
    for (const link of chapter?.next_chapter_links || []) {
      const edge = { from: chapter.id, to: link.to };
      if (!edgeLinkVisible(edge)) continue;
      rememberUnlockEdge(chapter.id, link.to, link);
    }
  }

  function rememberKnownOutgoingLinks(chapter) {
    for (const link of chapter?.next_chapter_links || []) {
      if (!chapterCanBeMapped(link.to)) continue;
      rememberKnownEdge(chapter.id, link.to, link);
    }
  }

  function showContextLinksForChapter(chapterId, marker, preservedEdge = null) {
    rebuildKnownEdgesFromRead();
    const markers = [marker];
    const sourceMarker = preservedEdge?.from ? markerByChapterId.get(preservedEdge.from) : null;
    if (sourceMarker && sourceMarker !== marker) markers.push(sourceMarker);
    showActiveLinksForPoints(markers);
    if (preservedEdge?.from && preservedEdge?.to) {
      rememberUnlockEdge(preservedEdge.to, preservedEdge.from, {
        type: "retour",
        label: "retour",
      });
      redrawInspectableLinks();
    }
  }

  function rebuildKnownEdgesFromRead() {
    progress.knownEdges = [];
    for (const chapterId of progress.read) {
      const chapter = chapterById.get(chapterId);
      unlockNextChapters(chapterId, markerByChapterId.get(chapterId), false);
      rememberKnownOutgoingLinks(chapter);
    }
    promoteBlockedChapters();
  }

  function rememberKnownEdgesFrom(chapterId) {
    for (const edge of progress.knownEdges) {
      if (edge.from !== chapterId) continue;
      if (!edgeLinkVisible(edge)) continue;
      linkManager.remember(progress.unlockEdges, edge.from, edge.to, edge);
    }
  }

  function showKnownLinksFromChapter(chapterId) {
    rebuildKnownEdgesFromRead();
    showActiveLinksForPoints([markerByChapterId.get(chapterId)]);
  }

  function showActiveLinksForPoints(markers) {
    const markerSet = new Set(markers.filter(Boolean));
    progress.unlockEdges = [];
    for (const edge of progress.knownEdges) {
      const fromMarker = markerByChapterId.get(edge.from);
      const toMarker = markerByChapterId.get(edge.to);
      if (!fromMarker || !toMarker || !edgeLinkVisible(edge)) continue;
      if (!markerSet.has(fromMarker) && !markerSet.has(toMarker)) continue;
      linkManager.remember(progress.unlockEdges, edge.from, edge.to, edge);
    }
    redrawInspectableLinks();
  }

  function zoomOutAfterReading(openedChapterIds, marker = null) {
    if (!openedChapterIds?.length) return;
    if (marker?.type === "space") {
      zoomOutFromSpaceMarker(marker);
      return;
    }
    const cartographic = viewer.camera.positionCartographic;
    const targetHeight = Math.min(
      POST_READ_ZOOM_OUT_MAX_HEIGHT,
      Math.max(cartographic.height * POST_READ_ZOOM_OUT_FACTOR, 850000)
    );
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        targetHeight
      ),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
      duration: 1.8,
      easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
      complete: syncZoomState,
    });
  }

  function zoomOutFromSpaceMarker(marker) {
    const cameraPosition = viewer.camera.positionWC;
    let away = Cesium.Cartesian3.subtract(cameraPosition, marker.position, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(away) < 1) {
      away = Cesium.Cartesian3.normalize(marker.position, away);
    } else {
      Cesium.Cartesian3.normalize(away, away);
    }
    const currentDistance = Cesium.Cartesian3.distance(cameraPosition, marker.position);
    const targetDistance = Math.min(
      CAMERA_MAX_HEIGHT,
      Math.max(currentDistance * 3.2, marker.lieu?.toLowerCase?.().includes("station spatiale") ? 2600000 : 4200000)
    );
    const destination = Cesium.Cartesian3.add(
      marker.position,
      Cesium.Cartesian3.multiplyByScalar(away, targetDistance, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const orientation = spaceCameraOrientation(marker, destination);
    viewer.camera.flyTo({
      destination,
      orientation,
      duration: 1.8,
      easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
      complete: () => {
        viewer.camera.setView({ destination, orientation });
        syncZoomState();
        requestAnimationFrame(() => vignette.position());
      },
    });
  }

  function flyToChapter(chapterId, options = {}) {
    const marker = markerByChapterId.get(chapterId);
    if (!marker) return;
    if (!options.allowRead && !firstReadableChapterId(marker)) return;
    if (options.suppressPopup) suppressAutoPopup = true;
    hidePopup();
    const complete = () => {
      syncZoomState();
      marker.baseVisible = true;
      if (options.restoreEdges) {
        historyReturnActive = true;
        progress.unlockEdges = options.restoreEdges.map((edge) => ({ ...edge }));
        redrawRestoredLinks();
      } else if (options.keepLinks) {
        historyReturnActive = true;
        // Navigation d'historique: la carte et les liens restent tels quels.
      } else if (options.showOutgoingLinks) {
        historyReturnActive = false;
        showContextLinksForChapter(chapterId, marker, options.preservedEdge || null);
      } else {
        historyReturnActive = false;
        redrawUnlockLines();
      }
      const canShowPopup = !!firstReadableChapterId(marker);
      if (options.suppressPopup || !canShowPopup) {
        suppressAutoPopup = true;
        selectedMarker = null;
      } else {
        forceShowPopup(marker, true, options.showChapterId || null);
      }
      updateHitTargets();
    };
    if (marker.type === "earth") {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, INTRO_TARGET_HEIGHT),
        orientation: {
          heading: viewer.camera.heading,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
        duration: 1.8,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        complete,
      });
      return;
    }
    const destination = spaceCameraDestination(marker);
    const orientation = spaceCameraOrientation(marker, destination);
    viewer.camera.flyTo({
      destination,
      orientation,
      duration: 1.8,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        viewer.camera.setView({ destination, orientation });
        requestAnimationFrame(() => {
          complete();
          vignette.position();
        });
      },
    });
  }

  function spaceCameraDestination(marker) {
    const direction = Cesium.Cartesian3.normalize(marker.position, new Cesium.Cartesian3());
    if (marker.lieu?.toLowerCase?.().includes("station spatiale")) {
      const tangent = spaceCameraTangent(direction);
      const outward = Cesium.Cartesian3.multiplyByScalar(direction, 760000, new Cesium.Cartesian3());
      const lateral = Cesium.Cartesian3.multiplyByScalar(tangent, 2300000, new Cesium.Cartesian3());
      return Cesium.Cartesian3.add(
        marker.position,
        Cesium.Cartesian3.add(outward, lateral, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
    }
    if (spaceMarkerIsDeep(marker)) {
      const tangent = spaceCameraTangent(direction);
      const distance = Math.max(8500000, Cesium.Cartesian3.magnitude(marker.position) * 0.16);
      const lateralDistance = Math.max(16000000, Cesium.Cartesian3.magnitude(marker.position) * 0.28);
      const outward = Cesium.Cartesian3.multiplyByScalar(direction, distance, new Cesium.Cartesian3());
      const lateral = Cesium.Cartesian3.multiplyByScalar(tangent, lateralDistance, new Cesium.Cartesian3());
      return Cesium.Cartesian3.add(
        marker.position,
        Cesium.Cartesian3.add(outward, lateral, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
    }
    const distance = Math.max(1200000, Cesium.Cartesian3.magnitude(marker.position) * 0.08);
    return Cesium.Cartesian3.add(
      marker.position,
      Cesium.Cartesian3.multiplyByScalar(direction, distance, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
  }

  function spaceMarkerIsDeep(marker) {
    return Cesium.Cartesian3.magnitude(marker.position) > EARTH_RADIUS_METERS * 8;
  }

  function spaceCameraTangent(direction) {
    let tangent = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, direction, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(tangent) < 0.001) {
      tangent = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Y, direction, tangent);
    }
    Cesium.Cartesian3.normalize(tangent, tangent);
    return tangent;
  }

  function spaceCameraOrientation(marker, cameraPosition = spaceCameraDestination(marker)) {
    const direction = Cesium.Cartesian3.subtract(marker.position, cameraPosition, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction);
    let right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(right) < 0.001) {
      right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Y, right);
    }
    Cesium.Cartesian3.normalize(right, right);
    const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(up, up);
    return {
      direction,
      up,
    };
  }

  function flyToLinkedChapter(link) {
    const chapterId = link.to;
    const canShowRead = progress.read.has(chapterId);
    const canShowOpen = progress.open.has(chapterId) && !progress.read.has(chapterId);
    if (!canShowRead && !canShowOpen) return;
    if (link.type === "retour") {
      const previous = linkHistory.pop() || null;
      const restoreEdges = previous?.edges || null;
      const restoreChapterId = previous?.chapterId || chapterId;
      const restoreCanShowRead = progress.read.has(restoreChapterId);
      const restoreCanShowOpen = progress.open.has(restoreChapterId) && !progress.read.has(restoreChapterId);
      if (!restoreCanShowRead && !restoreCanShowOpen) return;
      flyToChapter(restoreChapterId, {
        allowRead: restoreCanShowRead,
        showChapterId: restoreChapterId,
        restoreEdges,
        keepLinks: !restoreEdges,
        suppressPopup: true,
      });
      return;
    }
    linkHistory.push({
      chapterId: link.from,
      edges: progress.unlockEdges.map((edge) => ({ ...edge })),
    });
    flyToChapter(chapterId, {
      allowRead: canShowRead,
      showChapterId: chapterId,
      showOutgoingLinks: true,
      preservedEdge: link,
    });
  }

  function completeReader() {
    pauseReader();
    if (rsvp.mode === "vertical" && readerVerticalText) readerVerticalText.textContent = "";
    readerWords.textContent = "Fin";
    if (readerSeek) readerSeek.value = readerSeek.max;
    let newlyOpened = [];
    let newlyRead = false;
    if (rsvp.chapter) {
      progress.unlockEdges = [];
      if (!progress.read.has(rsvp.chapter.id)) {
        progress.readOrder.push(rsvp.chapter.id);
        newlyRead = true;
      }
      progress.read.add(rsvp.chapter.id);
      lastChapterId = rsvp.chapter.id;
      newlyOpened = unlockNextChapters(rsvp.chapter.id, rsvp.marker);
      newlyOpened.push(...promoteBlockedChapters());
    }
    refreshMarkerStatuses();
    if (rsvp.chapter?.id) showKnownLinksFromChapter(rsvp.chapter.id);
    else redrawUnlockLines();
    saveState();
    updateReadingScore(newlyRead);
    suppressAutoPopup = true;
    closeReader();
    zoomOutAfterReading(newlyOpened, rsvp.marker);
  }

  async function openReader(chapterId, marker) {
    const requestId = ++readerRequestId;
    Debug?.clear();
    Debug?.log("Reader", "consigne recue", { chapterId, lieu: marker?.lieu });
    pauseReader();
    stopReaderTimer();
    rsvp.groups = [];
    rsvp.index = 0;
    rsvp.displayedFirstGroupFor = null;
    rsvp.chapter = null;
    rsvp.marker = marker;
    if (readerVerticalText) readerVerticalText.textContent = "";
    reader.dataset.requestedChapterId = chapterId;
    reader.dataset.chapterId = "";
    readerPlace.textContent = "";
    applyReaderMode();
    if (rsvp.mode === "vertical") {
      readerWords.textContent = "";
      if (readerVerticalText) readerVerticalText.textContent = `Chargement chapitre ${chapterId}`;
    } else {
      readerWords.textContent = `Chargement chapitre ${chapterId}`;
    }
    reader.classList.add("is-open");
    reader.setAttribute("aria-hidden", "false");
    Debug?.log("Reader", "loading affiche", { chapterId, domText: readerWords.innerText });
    await nextPaint();
    if (requestId !== readerRequestId) return;
    Debug?.log("Reader", "appel RSVP apres loading", { chapterId, domText: readerWords.innerText });
    const { chapter, groups } = await RSVP.prepareChapter(chapterId);
    if (requestId !== readerRequestId) return;
    rsvp.chapter = chapter;
    rsvp.marker = marker;
    reader.dataset.chapterId = chapter.id;
    rsvp.groups = groups;
    if (readerVerticalText) readerVerticalText.textContent = "";
    Debug?.log("Reader", "chapitre installe", {
      requestedChapterId: chapterId,
      loadedChapterId: chapter.id,
      firstGroup: groups[0] || "",
    });
    rsvp.index = 0;
    rsvp.playing = false;
    readerPlace.innerHTML = vignette.htmlFor({
      lieu: chapter.lieu,
      heure: chapter.heure,
    }).replace(/<button[\s\S]*<\/button>/, "");
    readerWords.textContent = "";
    if (readerSeek) {
      readerSeek.max = String(Math.max(0, rsvp.groups.length - 1));
      readerSeek.value = "0";
    }
    reader.classList.add("is-open");
    reader.setAttribute("aria-hidden", "false");
    applyReaderMode();
    setReaderFontForChapter();
    updateSpeedLabel();
    hidePopup();
    if (rsvp.mode === "vertical") renderVerticalReader();
    else playReader();
  }

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function waitForCesiumReady(timeout = 6500) {
    return new Promise((resolve) => {
      let settled = false;
      let frames = 0;
      let tilesReady = !!viewer.scene.globe.tilesLoaded;
      let removePostRender = null;
      let removeTileProgress = null;
      let timer = null;

      const cleanup = () => {
        removePostRender?.();
        removeTileProgress?.();
        window.clearTimeout(timer);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const check = () => {
        if (frames >= 2 && tilesReady) finish();
      };

      removePostRender = viewer.scene.postRender.addEventListener(() => {
        frames += 1;
        tilesReady = tilesReady || !!viewer.scene.globe.tilesLoaded;
        check();
      });
      removeTileProgress = viewer.scene.globe.tileLoadProgressEvent.addEventListener((pendingTiles) => {
        tilesReady = pendingTiles === 0;
        check();
      });
      timer = window.setTimeout(finish, timeout);
      viewer.scene.requestRender();
    });
  }

  function openChapterForMarker(chapterId, marker) {
    if (!chapterId || !marker?.chapterIds?.includes(chapterId)) return false;
    openReader(chapterId, marker);
    return true;
  }

  function closeReader() {
    pauseReader();
    reader.classList.remove("is-open");
    reader.setAttribute("aria-hidden", "true");
    if (readerVerticalText) readerVerticalText.textContent = "";
    hidePopup();
  }

  function bindReaderControls() {
    const finishSeek = (event) => {
      if (!rsvp.seeking) return;
      if (event?.pointerId != null && readerSeek.hasPointerCapture?.(event.pointerId)) {
        readerSeek.releasePointerCapture(event.pointerId);
      }
      rsvp.index = Number(readerSeek.value);
      rsvp.seeking = false;
      showReaderWord(rsvp.index);
      if (rsvp.resumeAfterSeek) playReader();
      rsvp.resumeAfterSeek = false;
    };
    const startSeek = (event) => {
      if (event?.pointerId != null) readerSeek.setPointerCapture?.(event.pointerId);
      rsvp.seeking = true;
      rsvp.resumeAfterSeek = rsvp.playing;
      pauseReader();
    };
    readerSeek.addEventListener("pointerdown", (event) => {
      startSeek(event);
    });
    readerSeek.addEventListener("input", () => {
      if (!rsvp.seeking) startSeek();
      rsvp.index = Number(readerSeek.value);
      showReaderWord(rsvp.index);
    });
    readerSeek.addEventListener("pointerup", finishSeek);
    readerSeek.addEventListener("pointercancel", finishSeek);
    readerSeek.addEventListener("change", finishSeek);
    window.addEventListener("pointerup", finishSeek);
    readerSpeed.addEventListener("input", () => {
      rsvp.syllablesPerSecond = Number(readerSpeed.value);
      updateSpeedLabel();
      saveState();
    });
    readerClose.addEventListener("click", closeReader);
    readerMode?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleReaderMode();
    });
    readerNext?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      completeReader();
    });
    shareButton?.addEventListener("click", shareCurrentPage);
    mapTitle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      profileManager?.open();
    });
    profileManager.bind();
    reader.addEventListener("click", (event) => {
      if (event.target === reader || event.target.classList.contains("reader-backdrop")) closeReader();
    });
    updateSpeedLabel();
    updateProfile();
  }

  async function shareCurrentPage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    const payload = {
      title: "One Minute",
      text: "One Minute",
      url: window.location.href.split("#")[0],
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard?.writeText(payload.url);
      shareButton?.classList.add("is-copied");
      window.setTimeout(() => shareButton?.classList.remove("is-copied"), 900);
    } catch {
      // L'utilisateur peut annuler le partage natif.
    }
  }

  function playIntro() {
    introPlaying = true;
    selectedMarker = null;
    hidePopup();
    window.setTimeout(() => {
      introPlaying = false;
      updateMarkers();
      showInitialChapterPopup();
    }, 6500);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(VERSAILLES.lon, VERSAILLES.lat, INTRO_TARGET_HEIGHT),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 5.8,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(VERSAILLES.lon, VERSAILLES.lat, INTRO_TARGET_HEIGHT),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
          },
        });
        syncZoomState();
        introCurtain?.classList.remove("is-visible");
        introPlaying = false;
        updateMarkers();
        showInitialChapterPopup();
      },
    });
  }

  function restoreSession() {
    const marker = markerByChapterId.get(lastChapterId);
    if (!lastChapterId || !marker || !progress.read.has(lastChapterId)) return false;
    introPlaying = false;
    suppressAutoPopup = true;
    marker.baseVisible = true;
    showContextLinksForChapter(lastChapterId, marker);
    viewer.camera.setView({
      destination: marker.type === "earth"
        ? Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, INTRO_TARGET_HEIGHT)
        : marker.position,
      orientation: marker.type === "earth"
        ? {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        }
        : undefined,
    });
    syncZoomState();
    updateMarkers();
    updateHitTargets();
    return true;
  }

  bindZoomButtons();
  bindTooltip();
  bindReaderControls();
  bindOverlayRendering();
  await loadPoints();
  await waitForCesiumReady();
  if (!restoreSession()) playIntro();
})();
