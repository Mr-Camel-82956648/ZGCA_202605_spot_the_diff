(function () {
  var Shared = window.SpotDiffShared;
  var Admission = window.SpotDiffAdmission;
  var LEVELS = window.SPOT_DIFF_LEVELS || [];
  var STORAGE_KEY = "spot-diff-progress-v3";
  var TAP_THRESHOLD = 6;
  var RESULT_DELAY_MS = 520;
  var HOME_SWIPE_THRESHOLD = 28;
  var HOME_SWIPE_MAX_VERTICAL_RATIO = 1.1;
  var MAIN_THEME_PATH = "./assets/audio/bgm/main-theme.mp3";
  var UI_CLICK_SFX_PATH = "./assets/audio/sfx/ui-click.mp3";
  var DEFAULT_REQUIRED_DIFFERENCES = 6;
  var HOME_SLOT_COUNT = 5;
  var RESERVED_SLOT_PREVIEW = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'>" +
      "<defs>" +
        "<linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>" +
          "<stop offset='0%' stop-color='#d9e4e8'/>" +
          "<stop offset='100%' stop-color='#c7d6df'/>" +
        "</linearGradient>" +
      "</defs>" +
      "<rect width='320' height='320' fill='url(#bg)'/>" +
      "<circle cx='160' cy='160' r='112' fill='rgba(255,255,255,0.2)'/>" +
      "<circle cx='160' cy='160' r='84' fill='none' stroke='rgba(255,255,255,0.45)' stroke-width='2' stroke-dasharray='6 8'/>" +
      "<path d='M94 202c22-34 50-52 84-52 25 0 48 10 69 30' fill='none' stroke='rgba(68,80,88,0.18)' stroke-width='10' stroke-linecap='round'/>" +
    "</svg>"
  );

  if (!Shared || !LEVELS.length) {
    return;
  }

  function createGestureState() {
    return {
      activeBoard: null,
      pointers: new Map(),
      pinchStart: null
    };
  }

  function createHomeSwipeState() {
    return {
      pointerId: null,
      startX: 0,
      startY: 0,
      didSwipe: false
    };
  }

  function SpotDiffApp() {
    this.params = Shared.getQueryParams();
    this.debugMode = this.params.get("debug") === "1";
    this.progress = this.loadProgress();
    this.accessContext = Admission
      ? Admission.parseAccessContext(window.location)
      : {
        userId: null,
        hasUserId: false,
        mode: "single-player",
        config: null
      };
    this.admissionSync = Admission
      ? new Admission.AdmissionSync({
        context: this.accessContext,
        logger: this.createAdmissionLogger()
      })
      : null;
    this.audio = {
      path: MAIN_THEME_PATH,
      mainTheme: null,
      uiClick: Shared.createOneShotAudioPlayer(UI_CLICK_SFX_PATH, { volume: 0.62 }),
      attempted: false,
      unavailable: false
    };

    this.state = {
      currentLevelIndex: 0,
      homeLevelIndex: Math.min(this.progress.lastLevelIndex || 0, LEVELS.length - 1),
      currentLevel: null,
      foundIds: new Set(),
      levelReady: false,
      lastClick: "-",
      lastHit: "-",
      clearTimer: null,
      levelCleared: false,
      view: {
        zoom: 1,
        centerX: 0.5,
        centerY: 0.5,
        maxZoom: 4.5
      },
      gesture: createGestureState(),
      homeSwipe: createHomeSwipeState()
    };

    this.screens = {
      home: document.getElementById("homeScreen"),
      game: document.getElementById("gameScreen"),
      result: document.getElementById("resultScreen")
    };

    this.refs = {
      resetProgressButton: document.getElementById("resetProgressButton"),
      homeCarousel: document.getElementById("homeCarousel"),
      homePrevButton: document.getElementById("homePrevButton"),
      homeNextButton: document.getElementById("homeNextButton"),
      homeLevelPreview: document.getElementById("homeLevelPreview"),
      homePreviewImage: document.getElementById("homePreviewImage"),
      homePreviewLock: document.getElementById("homePreviewLock"),
      homePreviewState: document.getElementById("homePreviewState"),
      homeLevelTitle: document.getElementById("homeLevelTitle"),
      homeLevelMeta: document.getElementById("homeLevelMeta"),
      homeLevelHint: document.getElementById("homeLevelHint"),
      homeButton: document.getElementById("homeButton"),
      hudCounter: document.getElementById("hudCounter"),
      debugPanel: document.getElementById("debugPanel"),
      debugLastClick: document.getElementById("debugLastClick"),
      debugLastHit: document.getElementById("debugLastHit"),
      resultBackground: document.getElementById("resultBackground"),
      resultEyebrow: document.getElementById("resultEyebrow"),
      resultTitle: document.getElementById("resultTitle"),
      resultSubtitle: document.getElementById("resultSubtitle"),
      resultNextButton: document.getElementById("resultNextButton")
    };

    this.boards = {
      A: {
        key: "A",
        frame: document.getElementById("frameA"),
        image: document.getElementById("imageA"),
        foundLayer: document.getElementById("foundLayerA"),
        fxLayer: document.getElementById("fxLayerA"),
        debugLayer: document.getElementById("debugLayerA"),
        loading: document.getElementById("loadingA"),
        foundMarkers: new Map(),
        imageSize: null,
        currentLayout: null
      },
      B: {
        key: "B",
        frame: document.getElementById("frameB"),
        image: document.getElementById("imageB"),
        foundLayer: document.getElementById("foundLayerB"),
        fxLayer: document.getElementById("fxLayerB"),
        debugLayer: document.getElementById("debugLayerB"),
        loading: document.getElementById("loadingB"),
        foundMarkers: new Map(),
        imageSize: null,
        currentLayout: null
      }
    };

    this.bindEvents();
    if (this.params.get("reset") === "1") {
      this.resetProgress({ skipRender: true });
    }
    this.renderHome();
    this.applyDebugState();

    var startLevel = this.resolveStartLevel();
    if (startLevel !== null) {
      this.startFromLevel(startLevel);
    } else {
      this.showScreen("home");
    }

    this.bootstrapAdmissionState();
  }

  SpotDiffApp.prototype.loadProgress = function () {
    var defaults = {
      unlockedIndex: Math.max(LEVELS.length - 1, 0),
      completedLevelIds: [],
      lastLevelIndex: 0
    };

    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) {
        return defaults;
      }
      return {
        unlockedIndex: Math.max(LEVELS.length - 1, 0),
        completedLevelIds: Array.isArray(saved.completedLevelIds) ? saved.completedLevelIds : [],
        lastLevelIndex: typeof saved.lastLevelIndex === "number" ? Math.min(saved.lastLevelIndex, LEVELS.length - 1) : 0
      };
    } catch (error) {
      return defaults;
    }
  };

  SpotDiffApp.prototype.saveProgress = function () {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
  };

  SpotDiffApp.prototype.resetProgress = function (options) {
    this.progress = {
      unlockedIndex: Math.max(LEVELS.length - 1, 0),
      completedLevelIds: [],
      lastLevelIndex: 0
    };
    this.state.homeLevelIndex = 0;
    this.saveProgress();
    if (!(options && options.skipRender)) {
      this.renderHome();
    }
  };

  SpotDiffApp.prototype.resolveStartLevel = function () {
    var levelQuery = this.params.get("level");
    if (!levelQuery) {
      return null;
    }

    var matchedIndex = LEVELS.findIndex(function (level, index) {
      return level.levelId === levelQuery || String(index + 1) === levelQuery;
    });

    return matchedIndex >= 0 ? matchedIndex : null;
  };

  SpotDiffApp.prototype.getHomeSlotCount = function () {
    return Math.max(HOME_SLOT_COUNT, LEVELS.length);
  };

  SpotDiffApp.prototype.getHomeSlot = function (index) {
    if (LEVELS[index]) {
      return LEVELS[index];
    }

    return {
      levelId: "reserved-level-" + String(index + 1),
      title: "未开放关卡",
      imageA: RESERVED_SLOT_PREVIEW,
      imageB: RESERVED_SLOT_PREVIEW,
      reserved: true
    };
  };

  SpotDiffApp.prototype.getRequiredDifferences = function (level) {
    var configured = level && typeof level.requiredDifferences === "number"
      ? level.requiredDifferences
      : DEFAULT_REQUIRED_DIFFERENCES;
    var available = level && Array.isArray(level.differences)
      ? level.differences.length
      : configured;

    return Shared.clamp(configured, 1, available);
  };

  SpotDiffApp.prototype.getLevelStatus = function (index) {
    var level = LEVELS[index];
    if (!level) {
      return {
        key: "unavailable",
        label: "LOCKED",
        meta: "未开放"
      };
    }

    var completed = this.progress.completedLevelIds.indexOf(level.levelId) >= 0;

    if (completed) {
      return {
        key: "complete",
        label: "REPLAY",
        meta: "已完成"
      };
    }

    return {
      key: "incomplete",
      label: "ENTER",
      meta: "未完成"
    };
  };

  SpotDiffApp.prototype.isHomeHorizontalSwipe = function (deltaX, deltaY) {
    var absDeltaX = Math.abs(deltaX);
    var absDeltaY = Math.abs(deltaY);
    return absDeltaX >= HOME_SWIPE_THRESHOLD && absDeltaY <= absDeltaX * HOME_SWIPE_MAX_VERTICAL_RATIO;
  };

  SpotDiffApp.prototype.bindEvents = function () {
    var self = this;

    if (this.refs.resetProgressButton) {
      this.refs.resetProgressButton.addEventListener("click", function () {
        self.playUiClick();
        self.resetProgress();
      });
    }

    this.refs.homePrevButton.addEventListener("click", function () {
      self.playUiClick();
      self.moveHomeSelection(-1);
    });

    this.refs.homeNextButton.addEventListener("click", function () {
      self.playUiClick();
      self.moveHomeSelection(1);
    });

    this.refs.homeLevelPreview.addEventListener("click", function () {
      if (self.state.homeSwipe.didSwipe) {
        self.state.homeSwipe.didSwipe = false;
        return;
      }
      self.playUiClick();
      self.enterSelectedHomeLevel();
    });

    this.refs.homeLevelPreview.addEventListener("pointerdown", function (event) {
      self.onHomePreviewPointerDown(event);
    });

    this.refs.homeLevelPreview.addEventListener("pointerup", function (event) {
      self.onHomePreviewPointerUpOrCancel(event);
    });

    this.refs.homeLevelPreview.addEventListener("pointercancel", function (event) {
      self.onHomePreviewPointerUpOrCancel(event);
    });

    this.refs.homeLevelPreview.addEventListener("lostpointercapture", function (event) {
      self.onHomePreviewPointerUpOrCancel(event);
    });

    this.refs.homeLevelPreview.addEventListener("pointermove", function (event) {
      self.onHomePreviewPointerMove(event);
    });

    this.refs.homeButton.addEventListener("click", function () {
      self.playUiClick();
      self.goHome();
    });

    this.refs.resultNextButton.addEventListener("click", function () {
      self.playUiClick();
      self.advanceFromResult();
    });

    Object.keys(this.boards).forEach(function (key) {
      var board = self.boards[key];
      board.frame.addEventListener("pointerdown", function (event) {
        self.onPointerDown(event, board);
      });
      board.frame.addEventListener("pointermove", function (event) {
        self.onPointerMove(event, board);
      });
      board.frame.addEventListener("pointerup", function (event) {
        self.onPointerUpOrCancel(event, board);
      });
      board.frame.addEventListener("pointercancel", function (event) {
        self.onPointerUpOrCancel(event, board);
      });
      board.frame.addEventListener("lostpointercapture", function (event) {
        self.onPointerUpOrCancel(event, board);
      });
      board.frame.addEventListener("wheel", function (event) {
        self.onWheel(event, board);
      }, { passive: false });
    });

    window.addEventListener("resize", function () {
      self.renderScene();
    });
  };

  SpotDiffApp.prototype.playUiClick = function () {
    if (!this.audio.uiClick) {
      return;
    }
    this.audio.uiClick.play();
  };

  SpotDiffApp.prototype.createAdmissionLogger = function () {
    var self = this;

    return function (level, message, meta) {
      if (!window.console || !self.accessContext || !self.accessContext.hasUserId) {
        return;
      }

      var method = level === "warn" || level === "error" ? "warn" : "info";
      if (typeof window.console[method] !== "function") {
        method = "log";
      }
      window.console[method]("[admission]", message, meta || "");
    };
  };

  SpotDiffApp.prototype.bootstrapAdmissionState = function () {
    var self = this;

    if (!this.admissionSync) {
      return;
    }

    this.admissionSync.bootstrap().then(function () {
      self.maybeSyncAdmissionClear();
    });
  };

  SpotDiffApp.prototype.hasClearedAllOpenLevels = function () {
    if (!Admission) {
      return false;
    }

    return Admission.hasClearedAllPlayableLevels(LEVELS, this.progress.completedLevelIds);
  };

  SpotDiffApp.prototype.maybeSyncAdmissionClear = function () {
    if (!this.admissionSync) {
      return;
    }

    this.admissionSync.maybeRegisterClear({
      isAllLevelsCleared: this.hasClearedAllOpenLevels()
    });
  };

  SpotDiffApp.prototype.applyDebugState = function () {
    if (this.debugMode) {
      this.refs.debugPanel.classList.remove("hidden");
      document.body.classList.add("debug-enabled");
    }
  };

  SpotDiffApp.prototype.showScreen = function (name) {
    Object.keys(this.screens).forEach(function (key) {
      this.screens[key].classList.toggle("screen--active", key === name);
    }, this);
  };

  SpotDiffApp.prototype.goHome = function () {
    this.clearPendingResult();
    if (this.state.currentLevel) {
      this.state.homeLevelIndex = this.state.currentLevelIndex;
    }
    this.renderHome();
    this.showScreen("home");
  };

  SpotDiffApp.prototype.clearPendingResult = function () {
    if (this.state.clearTimer) {
      window.clearTimeout(this.state.clearTimer);
      this.state.clearTimer = null;
    }
  };

  SpotDiffApp.prototype.moveHomeSelection = function (delta) {
    var nextIndex = Shared.clamp(this.state.homeLevelIndex + delta, 0, this.getHomeSlotCount() - 1);
    this.state.homeLevelIndex = nextIndex;
    this.renderHome();
  };

  SpotDiffApp.prototype.renderHome = function () {
    var slotCount = this.getHomeSlotCount();
    var index = Shared.clamp(this.state.homeLevelIndex, 0, slotCount - 1);
    var level = this.getHomeSlot(index);
    var status = this.getLevelStatus(index);

    this.state.homeLevelIndex = index;
    this.refs.homePreviewImage.src = level.imageA;
    this.refs.homePreviewImage.alt = (level.title || level.levelId) + " 预览";
    this.refs.homeLevelTitle.textContent = level.title || level.levelId;
    this.refs.homeLevelMeta.textContent = "关卡 [" + (index + 1) + "/" + slotCount + "] · " + status.meta;
    this.refs.homePreviewState.textContent = status.label;
    this.refs.homePreviewLock.classList.toggle("hidden", status.key !== "unavailable");
    this.refs.homeLevelPreview.classList.toggle("home-preview--unavailable", status.key === "unavailable");
    this.refs.homeLevelPreview.classList.toggle("home-preview--complete", status.key === "complete");
    this.refs.homeLevelPreview.classList.toggle("home-preview--incomplete", status.key === "incomplete");
    this.refs.homePrevButton.disabled = index === 0;
    this.refs.homeNextButton.disabled = index === slotCount - 1;
  };

  SpotDiffApp.prototype.enterSelectedHomeLevel = function () {
    var status = this.getLevelStatus(this.state.homeLevelIndex);
    if (status.key === "unavailable") {
      Shared.showTemporaryClass(this.refs.homeLevelPreview, "home-preview--shake", 420);
      return;
    }

    this.startFromLevel(this.state.homeLevelIndex, { fromUserGesture: true });
  };

  SpotDiffApp.prototype.onHomePreviewPointerDown = function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    this.state.homeSwipe.pointerId = event.pointerId;
    this.state.homeSwipe.startX = event.clientX;
    this.state.homeSwipe.startY = event.clientY;
    this.state.homeSwipe.didSwipe = false;
    this.refs.homeLevelPreview.setPointerCapture(event.pointerId);
  };

  SpotDiffApp.prototype.onHomePreviewPointerMove = function (event) {
    if (this.state.homeSwipe.pointerId !== event.pointerId) {
      return;
    }

    var deltaX = event.clientX - this.state.homeSwipe.startX;
    var deltaY = event.clientY - this.state.homeSwipe.startY;
    if (Math.abs(deltaX) >= 12 && Math.abs(deltaY) <= Math.abs(deltaX) * 1.15) {
      event.preventDefault();
    }
  };

  SpotDiffApp.prototype.onHomePreviewPointerUpOrCancel = function (event) {
    if (this.state.homeSwipe.pointerId !== event.pointerId) {
      return;
    }

    var deltaX = event.clientX - this.state.homeSwipe.startX;
    var deltaY = event.clientY - this.state.homeSwipe.startY;
    this.state.homeSwipe.pointerId = null;

    if (this.isHomeHorizontalSwipe(deltaX, deltaY)) {
      this.moveHomeSelection(deltaX < 0 ? 1 : -1);
      this.state.homeSwipe.didSwipe = true;
      window.setTimeout(function () {
        this.state.homeSwipe.didSwipe = false;
      }.bind(this), 80);
    }
  };

  SpotDiffApp.prototype.ensureMainTheme = function () {
    var self = this;

    if (this.audio.mainTheme || this.audio.unavailable) {
      return;
    }

    this.audio.mainTheme = new Audio(this.audio.path);
    this.audio.mainTheme.loop = true;
    this.audio.mainTheme.preload = "none";
    this.audio.mainTheme.volume = 0.52;
    this.audio.mainTheme.addEventListener("error", function () {
      self.audio.unavailable = true;
      self.audio.mainTheme = null;
      if (self.debugMode) {
        window.console.info("BGM unavailable:", self.audio.path);
      }
    }, { once: true });
  };

  SpotDiffApp.prototype.maybeStartMainTheme = function () {
    if (this.audio.unavailable) {
      return;
    }

    this.ensureMainTheme();
    if (!this.audio.mainTheme) {
      return;
    }

    this.audio.attempted = true;
    var playPromise = this.audio.mainTheme.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(function () {});
    }
  };

  SpotDiffApp.prototype.startFromLevel = function (index, options) {
    if (!LEVELS.length) {
      return;
    }

    var safeIndex = Shared.clamp(index, 0, LEVELS.length - 1);
    var level = LEVELS[safeIndex];
    if (!level) {
      return;
    }

    this.state.currentLevelIndex = safeIndex;
    this.progress.lastLevelIndex = this.state.currentLevelIndex;
    this.state.homeLevelIndex = this.state.currentLevelIndex;
    this.progress.unlockedIndex = Math.max(LEVELS.length - 1, 0);
    this.saveProgress();

    if (options && options.fromUserGesture) {
      this.maybeStartMainTheme();
    }

    this.showScreen("game");
    this.loadLevel(this.state.currentLevelIndex);
  };

  SpotDiffApp.prototype.loadLevel = function (index) {
    var self = this;
    var level = LEVELS[index];

    this.clearPendingResult();
    this.state.currentLevel = level;
    this.state.currentLevelIndex = index;
    this.state.foundIds = new Set();
    this.state.levelReady = false;
    this.state.levelCleared = false;
    this.state.lastClick = "-";
    this.state.lastHit = "-";
    this.state.view = {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5,
      maxZoom: 4.5
    };
    this.state.gesture = createGestureState();

    this.refs.debugLastClick.textContent = "-";
    this.refs.debugLastHit.textContent = "-";
    this.updateCounter();
    this.clearSceneLayers();
    this.setLoadingState(true);

    Promise.all([
      Shared.onceImageLoaded(this.boards.A.image, level.imageA),
      Shared.onceImageLoaded(this.boards.B.image, level.imageB)
    ]).then(function (sizes) {
      self.boards.A.imageSize = sizes[0];
      self.boards.B.imageSize = sizes[1];
      self.setLoadingState(false);
      self.state.levelReady = true;
      self.warnIfAspectRatioDrifts();
      window.requestAnimationFrame(function () {
        self.renderScene();
      });
    }).catch(function () {
      self.setLoadingState(false, "LOAD FAILED");
    });
  };

  SpotDiffApp.prototype.setLoadingState = function (isLoading, label) {
    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      board.frame.classList.toggle("orb-frame--loading", isLoading);
      board.loading.textContent = label || "LOADING";
      board.loading.classList.toggle("hidden", !isLoading);
    }, this);
  };

  SpotDiffApp.prototype.warnIfAspectRatioDrifts = function () {
    if (!this.boards.A.imageSize || !this.boards.B.imageSize) {
      return;
    }

    var ratioA = this.boards.A.imageSize.width / this.boards.A.imageSize.height;
    var ratioB = this.boards.B.imageSize.width / this.boards.B.imageSize.height;
    if (Math.abs(ratioA - ratioB) > 0.001) {
      window.console.warn("Image A/B aspect ratios do not match. Shared camera alignment may drift.");
    }
  };

  SpotDiffApp.prototype.clearSceneLayers = function () {
    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      board.foundLayer.innerHTML = "";
      board.fxLayer.innerHTML = "";
      board.debugLayer.innerHTML = "";
      board.foundMarkers = new Map();
      board.currentLayout = null;
    }, this);
  };

  SpotDiffApp.prototype.updateCounter = function () {
    var required = this.state.currentLevel ? this.getRequiredDifferences(this.state.currentLevel) : 0;
    var found = Math.min(this.state.foundIds.size, required);
    this.refs.hudCounter.textContent = found + " / " + required;
  };

  SpotDiffApp.prototype.getBoardFrameSize = function (board) {
    var rect = board.frame.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height
    };
  };

  SpotDiffApp.prototype.getBoardMetrics = function (board, zoom) {
    var frame = this.getBoardFrameSize(board);
    var metrics = Shared.getCoverMetrics(
      frame.width,
      frame.height,
      board.imageSize.width,
      board.imageSize.height,
      zoom
    );

    return {
      frameWidth: frame.width,
      frameHeight: frame.height,
      displayWidth: metrics.displayWidth,
      displayHeight: metrics.displayHeight
    };
  };

  SpotDiffApp.prototype.clampViewCenter = function () {
    if (!this.state.levelReady) {
      return;
    }

    var minX = 0;
    var maxX = 1;
    var minY = 0;
    var maxY = 1;
    var zoom = this.state.view.zoom;

    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      var metrics = this.getBoardMetrics(board, zoom);
      var xPadding = metrics.frameWidth / (2 * metrics.displayWidth);
      var yPadding = metrics.frameHeight / (2 * metrics.displayHeight);
      minX = Math.max(minX, xPadding);
      maxX = Math.min(maxX, 1 - xPadding);
      minY = Math.max(minY, yPadding);
      maxY = Math.min(maxY, 1 - yPadding);
    }, this);

    if (minX > maxX) {
      minX = maxX = 0.5;
    }
    if (minY > maxY) {
      minY = maxY = 0.5;
    }

    this.state.view.centerX = Shared.clamp(this.state.view.centerX, minX, maxX);
    this.state.view.centerY = Shared.clamp(this.state.view.centerY, minY, maxY);
  };

  SpotDiffApp.prototype.getBoardLayout = function (board) {
    var metrics = this.getBoardMetrics(board, this.state.view.zoom);
    var left = metrics.frameWidth / 2 - this.state.view.centerX * metrics.displayWidth;
    var top = metrics.frameHeight / 2 - this.state.view.centerY * metrics.displayHeight;

    left = Shared.clamp(left, metrics.frameWidth - metrics.displayWidth, 0);
    top = Shared.clamp(top, metrics.frameHeight - metrics.displayHeight, 0);

    return {
      frameWidth: metrics.frameWidth,
      frameHeight: metrics.frameHeight,
      displayWidth: metrics.displayWidth,
      displayHeight: metrics.displayHeight,
      left: left,
      top: top
    };
  };

  SpotDiffApp.prototype.applyBoardLayout = function (board, layout) {
    board.image.style.width = layout.displayWidth + "px";
    board.image.style.height = layout.displayHeight + "px";
    board.image.style.left = layout.left + "px";
    board.image.style.top = layout.top + "px";
    board.currentLayout = layout;
  };

  SpotDiffApp.prototype.renderScene = function () {
    if (!this.state.levelReady || !this.state.currentLevel) {
      return;
    }

    this.clampViewCenter();

    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      this.applyBoardLayout(board, this.getBoardLayout(board));
    }, this);

    this.syncFoundMarkers();
    this.renderDebugLayer();
    this.updateCounter();
  };

  SpotDiffApp.prototype.localToImageNormalized = function (board, localPoint, layout) {
    return {
      x: (localPoint.x - layout.left) / layout.displayWidth,
      y: (localPoint.y - layout.top) / layout.displayHeight
    };
  };

  SpotDiffApp.prototype.imageNormalizedToLocal = function (board, normalizedPoint, layout) {
    return {
      x: layout.left + normalizedPoint.x * layout.displayWidth,
      y: layout.top + normalizedPoint.y * layout.displayHeight
    };
  };

  SpotDiffApp.prototype.getProjectedRadius = function (board, difference, layout) {
    return difference.radius * Math.min(layout.displayWidth, layout.displayHeight);
  };

  SpotDiffApp.prototype.syncFoundMarkers = function () {
    var self = this;

    Object.keys(this.boards).forEach(function (key) {
      var board = self.boards[key];
      var activeIds = new Set();

      self.state.currentLevel.differences.forEach(function (difference) {
        if (!self.state.foundIds.has(difference.id)) {
          return;
        }

        activeIds.add(difference.id);
        var marker = board.foundMarkers.get(difference.id);
        if (!marker) {
          marker = Shared.createEl("div", "found-marker found-marker--fresh");
          board.foundMarkers.set(difference.id, marker);
          board.foundLayer.appendChild(marker);
          window.setTimeout(function () {
            marker.classList.remove("found-marker--fresh");
          }, 320);
        }

        var center = self.imageNormalizedToLocal(board, difference, board.currentLayout);
        var radius = self.getProjectedRadius(board, difference, board.currentLayout);
        var diameter = Math.max(radius * 1.4, 20);
        var outerLine = Shared.clamp(diameter * 0.105, 2.5, 4.8);
        var innerLine = Shared.clamp(diameter * 0.075, 1.8, 3.4);
        var innerInset = Shared.clamp(diameter * 0.24, 5, 12);

        marker.style.left = center.x + "px";
        marker.style.top = center.y + "px";
        marker.style.width = diameter + "px";
        marker.style.height = diameter + "px";
        marker.style.setProperty("--marker-outer-line", outerLine + "px");
        marker.style.setProperty("--marker-inner-line", innerLine + "px");
        marker.style.setProperty("--marker-inner-inset", innerInset + "px");
      });

      board.foundMarkers.forEach(function (marker, differenceId) {
        if (!activeIds.has(differenceId)) {
          marker.remove();
          board.foundMarkers.delete(differenceId);
        }
      });
    });
  };

  SpotDiffApp.prototype.renderDebugLayer = function () {
    var self = this;

    Object.keys(this.boards).forEach(function (key) {
      self.boards[key].debugLayer.innerHTML = "";
    });

    if (!this.debugMode || !this.state.levelReady) {
      return;
    }

    this.state.currentLevel.differences.forEach(function (difference) {
      Object.keys(self.boards).forEach(function (key) {
        var board = self.boards[key];
        var hotspot = Shared.createEl("div", "debug-hotspot");
        var label = Shared.createEl("span", "debug-hotspot__label", difference.id);
        var center = self.imageNormalizedToLocal(board, difference, board.currentLayout);
        var radius = self.getProjectedRadius(board, difference, board.currentLayout);
        var diameter = radius * 2;

        hotspot.style.left = center.x + "px";
        hotspot.style.top = center.y + "px";
        hotspot.style.width = diameter + "px";
        hotspot.style.height = diameter + "px";
        if (self.state.foundIds.has(difference.id)) {
          hotspot.classList.add("debug-hotspot--found");
        }

        hotspot.appendChild(label);
        board.debugLayer.appendChild(hotspot);
      });
    });
  };

  SpotDiffApp.prototype.findDifferenceAtPoint = function (board, normalizedPoint) {
    var imageWidth = board.imageSize.width;
    var imageHeight = board.imageSize.height;
    var minDimension = Math.min(imageWidth, imageHeight);

    return this.state.currentLevel.differences.find(function (difference) {
      var dx = (normalizedPoint.x - difference.x) * imageWidth;
      var dy = (normalizedPoint.y - difference.y) * imageHeight;
      var radius = difference.radius * minDimension;
      return dx * dx + dy * dy <= radius * radius;
    });
  };

  SpotDiffApp.prototype.updateDebugReadout = function (boardKey, point, resultLabel) {
    this.state.lastClick = boardKey + " (" + Shared.formatNumber(point.x) + ", " + Shared.formatNumber(point.y) + ")";
    this.state.lastHit = resultLabel;
    this.refs.debugLastClick.textContent = this.state.lastClick;
    this.refs.debugLastHit.textContent = this.state.lastHit;
  };

  SpotDiffApp.prototype.handleBoardTap = function (board, localPoint) {
    if (!this.state.levelReady || !board.currentLayout || this.state.levelCleared) {
      return;
    }

    if (!Shared.pointInCircle(localPoint, board.currentLayout.frameWidth, board.currentLayout.frameHeight)) {
      return;
    }

    this.playUiClick();

    var normalizedPoint = this.localToImageNormalized(board, localPoint, board.currentLayout);
    var difference = this.findDifferenceAtPoint(board, normalizedPoint);

    if (!difference) {
      this.updateDebugReadout(board.key, normalizedPoint, "miss");
      this.spawnPulse(board, localPoint, "tap-pulse--miss");
      return;
    }

    if (this.state.foundIds.has(difference.id)) {
      this.updateDebugReadout(board.key, normalizedPoint, difference.id + " (found)");
      return;
    }

    this.state.foundIds.add(difference.id);
    this.updateDebugReadout(board.key, normalizedPoint, difference.id);
    this.syncFoundMarkers();
    this.renderDebugLayer();
    this.updateCounter();
    this.spawnFoundPulse(difference);

    if (this.state.foundIds.size >= this.getRequiredDifferences(this.state.currentLevel)) {
      this.onLevelCleared();
    }
  };

  SpotDiffApp.prototype.spawnPulse = function (board, localPoint, className) {
    var pulse = Shared.createEl("div", "tap-pulse " + className);
    pulse.style.left = localPoint.x + "px";
    pulse.style.top = localPoint.y + "px";
    board.fxLayer.appendChild(pulse);
    window.setTimeout(function () {
      pulse.remove();
    }, 500);
  };

  SpotDiffApp.prototype.spawnFoundPulse = function (difference) {
    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      var localPoint = this.imageNormalizedToLocal(board, difference, board.currentLayout);
      var pulse = Shared.createEl("div", "tap-pulse tap-pulse--hit");
      pulse.style.left = localPoint.x + "px";
      pulse.style.top = localPoint.y + "px";
      board.fxLayer.appendChild(pulse);
      window.setTimeout(function () {
        pulse.remove();
      }, 480);
    }, this);
  };

  SpotDiffApp.prototype.onLevelCleared = function () {
    if (this.state.levelCleared) {
      return;
    }

    this.state.levelCleared = true;
    var level = this.state.currentLevel;

    if (this.progress.completedLevelIds.indexOf(level.levelId) === -1) {
      this.progress.completedLevelIds.push(level.levelId);
    }

    this.progress.unlockedIndex = Math.max(LEVELS.length - 1, 0);
    this.progress.lastLevelIndex = this.state.currentLevelIndex;
    this.state.homeLevelIndex = this.state.currentLevelIndex;
    this.saveProgress();
    this.maybeSyncAdmissionClear();
    this.renderHome();
    this.clearPendingResult();
    this.state.clearTimer = window.setTimeout(function () {
      this.showResultScreen();
    }.bind(this), RESULT_DELAY_MS);
  };

  SpotDiffApp.prototype.buildResultCopy = function (level, isFinalLevel) {
    if (isFinalLevel) {
      return {
        eyebrow: "JOURNEY COMPLETE",
        title: level.title,
        subtitle: level.titleEn || ""
      };
    }

    return {
      eyebrow: "ARCHIVE NOTE",
      title: level.title,
      subtitle: level.titleEn || ""
    };
  };

  SpotDiffApp.prototype.showResultScreen = function () {
    var isFinalLevel = this.state.currentLevelIndex === LEVELS.length - 1;
    var copy = this.buildResultCopy(this.state.currentLevel, isFinalLevel);

    this.refs.resultBackground.style.backgroundImage = "url('" + this.state.currentLevel.imageA + "')";
    this.refs.resultEyebrow.textContent = copy.eyebrow;
    this.refs.resultTitle.textContent = copy.title;
    this.refs.resultSubtitle.textContent = copy.subtitle || "";
    this.refs.resultSubtitle.classList.toggle("hidden", !copy.subtitle);
    this.refs.resultNextButton.textContent = isFinalLevel ? "RETURN HOME >" : "NEXT >";
    this.showScreen("result");
  };

  SpotDiffApp.prototype.advanceFromResult = function () {
    if (this.state.currentLevelIndex >= LEVELS.length - 1) {
      this.goHome();
      return;
    }

    this.startFromLevel(this.state.currentLevelIndex + 1);
  };

  SpotDiffApp.prototype.onPointerDown = function (event, board) {
    if (!this.state.levelReady || !board.currentLayout) {
      return;
    }

    var localPoint = Shared.getLocalPoint(event, board.frame);
    if (!Shared.pointInCircle(localPoint, board.currentLayout.frameWidth, board.currentLayout.frameHeight)) {
      return;
    }

    var gesture = this.state.gesture;
    if (gesture.activeBoard && gesture.activeBoard !== board.key && gesture.pointers.size) {
      return;
    }

    event.preventDefault();
    gesture.activeBoard = board.key;
    gesture.pointers.set(event.pointerId, {
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      localX: localPoint.x,
      localY: localPoint.y,
      tapEligible: true
    });
    board.frame.classList.add("orb-frame--interacting");
    board.frame.setPointerCapture(event.pointerId);

    if (gesture.pointers.size === 2) {
      gesture.pointers.forEach(function (pointer) {
        pointer.tapEligible = false;
      });
      this.startPinchGesture(board);
    }
  };

  SpotDiffApp.prototype.startPinchGesture = function (board) {
    var points = Array.from(this.state.gesture.pointers.values());
    if (points.length < 2) {
      this.state.gesture.pinchStart = null;
      return;
    }

    var first = { x: points[0].localX, y: points[0].localY };
    var second = { x: points[1].localX, y: points[1].localY };
    var midpoint = Shared.midpoint(first, second);

    this.state.gesture.pinchStart = {
      zoom: this.state.view.zoom,
      distance: Shared.distance(first, second),
      anchor: this.localToImageNormalized(board, midpoint, board.currentLayout)
    };
  };

  SpotDiffApp.prototype.onPointerMove = function (event, board) {
    var gesture = this.state.gesture;
    var pointer = gesture.pointers.get(event.pointerId);
    if (!pointer || gesture.activeBoard !== board.key || !this.state.levelReady) {
      return;
    }

    var localPoint = Shared.getLocalPoint(event, board.frame);
    pointer.localX = localPoint.x;
    pointer.localY = localPoint.y;

    if (gesture.pointers.size >= 2 && gesture.pinchStart) {
      event.preventDefault();
      this.updatePinchGesture(board);
      pointer.lastClientX = event.clientX;
      pointer.lastClientY = event.clientY;
      return;
    }

    var dx = event.clientX - pointer.lastClientX;
    var dy = event.clientY - pointer.lastClientY;
    if (dx || dy) {
      event.preventDefault();
      if (Shared.distance(
        { x: event.clientX, y: event.clientY },
        { x: pointer.startClientX, y: pointer.startClientY }
      ) > TAP_THRESHOLD) {
        pointer.tapEligible = false;
      }

      this.panBy(board, dx, dy);
      pointer.lastClientX = event.clientX;
      pointer.lastClientY = event.clientY;
    }
  };

  SpotDiffApp.prototype.panBy = function (board, deltaX, deltaY) {
    if (!board.currentLayout) {
      return;
    }

    this.state.view.centerX -= deltaX / board.currentLayout.displayWidth;
    this.state.view.centerY -= deltaY / board.currentLayout.displayHeight;
    this.renderScene();
  };

  SpotDiffApp.prototype.updatePinchGesture = function (board) {
    var points = Array.from(this.state.gesture.pointers.values());
    if (points.length < 2) {
      return;
    }

    var first = { x: points[0].localX, y: points[0].localY };
    var second = { x: points[1].localX, y: points[1].localY };
    var currentDistance = Shared.distance(first, second);
    var currentMidpoint = Shared.midpoint(first, second);
    var pinchStart = this.state.gesture.pinchStart;

    if (!pinchStart || !currentDistance) {
      return;
    }

    this.state.view.zoom = Shared.clamp(
      pinchStart.zoom * (currentDistance / pinchStart.distance),
      1,
      this.state.view.maxZoom
    );
    this.setViewCenterForAnchor(board, currentMidpoint, pinchStart.anchor);
    this.renderScene();
  };

  SpotDiffApp.prototype.setViewCenterForAnchor = function (board, localPoint, anchor) {
    var metrics = this.getBoardMetrics(board, this.state.view.zoom);
    this.state.view.centerX = anchor.x + (metrics.frameWidth / 2 - localPoint.x) / metrics.displayWidth;
    this.state.view.centerY = anchor.y + (metrics.frameHeight / 2 - localPoint.y) / metrics.displayHeight;
  };

  SpotDiffApp.prototype.onPointerUpOrCancel = function (event, board) {
    var gesture = this.state.gesture;
    var pointer = gesture.pointers.get(event.pointerId);

    if (!pointer) {
      if (!gesture.pointers.size) {
        board.frame.classList.remove("orb-frame--interacting");
      }
      return;
    }

    var localPoint = Shared.getLocalPoint(event, board.frame);
    var wasTap = pointer.tapEligible && gesture.pointers.size === 1 && gesture.activeBoard === board.key;

    gesture.pointers.delete(event.pointerId);
    if (!gesture.pointers.size) {
      gesture.activeBoard = null;
      gesture.pinchStart = null;
      board.frame.classList.remove("orb-frame--interacting");
    } else if (gesture.pointers.size === 1) {
      var remainingPointer = Array.from(gesture.pointers.values())[0];
      remainingPointer.startClientX = remainingPointer.lastClientX;
      remainingPointer.startClientY = remainingPointer.lastClientY;
      remainingPointer.tapEligible = false;
      gesture.pinchStart = null;
    } else {
      this.startPinchGesture(board);
    }

    if (wasTap) {
      this.handleBoardTap(board, localPoint);
    }
  };

  SpotDiffApp.prototype.onWheel = function (event, board) {
    if (!this.state.levelReady || !board.currentLayout) {
      return;
    }

    var localPoint = Shared.getLocalPoint(event, board.frame);
    if (!Shared.pointInCircle(localPoint, board.currentLayout.frameWidth, board.currentLayout.frameHeight)) {
      return;
    }

    event.preventDefault();
    var anchor = this.localToImageNormalized(board, localPoint, board.currentLayout);
    var zoomFactor = Math.exp(-event.deltaY * 0.00125);
    this.state.view.zoom = Shared.clamp(this.state.view.zoom * zoomFactor, 1, this.state.view.maxZoom);
    this.setViewCenterForAnchor(board, localPoint, anchor);
    this.renderScene();
  };

  window.addEventListener("DOMContentLoaded", function () {
    window.spotDiffApp = new SpotDiffApp();
  });
})();
