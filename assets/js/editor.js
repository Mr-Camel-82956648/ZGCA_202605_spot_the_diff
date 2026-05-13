(function () {
  var Shared = window.SpotDiffShared;
  var LEVELS = window.SPOT_DIFF_LEVELS || [];
  var TAP_THRESHOLD = 6;
  var DEFAULT_REQUIRED_DIFFERENCES = 6;

  if (!Shared) {
    return;
  }

  function cloneDifferences(differences) {
    return (differences || []).map(function (difference) {
      return {
        id: difference.id,
        x: difference.x,
        y: difference.y,
        radius: difference.radius
      };
    });
  }

  function createGestureState() {
    return {
      activeBoard: null,
      pointers: new Map(),
      pinchStart: null
    };
  }

  function createViewState() {
    return {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5,
      maxZoom: 5
    };
  }

  function formatJsString(value) {
    return JSON.stringify(value || "");
  }

  function formatPointLine(point, indent) {
    return (
      indent +
      "{ id: " + formatJsString(point.id) +
      ", x: " + Shared.formatNumber(point.x) +
      ", y: " + Shared.formatNumber(point.y) +
      ", radius: " + Shared.formatNumber(point.radius) +
      " }"
    );
  }

  function EditorApp() {
    this.state = {
      levelId: "",
      title: "",
      summary: "",
      requiredDifferences: DEFAULT_REQUIRED_DIFFERENCES,
      imageA: "",
      imageB: "",
      points: [],
      lastPoint: null,
      activePointIndex: null,
      exportMode: "differences",
      view: createViewState(),
      gesture: createGestureState(),
      ready: false
    };

    this.refs = {
      levelSelect: document.getElementById("levelSelect"),
      loadSelectedLevelButton: document.getElementById("loadSelectedLevelButton"),
      createBlankButton: document.getElementById("createBlankButton"),
      levelIdInput: document.getElementById("levelIdInput"),
      titleInput: document.getElementById("titleInput"),
      summaryInput: document.getElementById("summaryInput"),
      imageAInput: document.getElementById("imageAInput"),
      imageBInput: document.getElementById("imageBInput"),
      radiusInput: document.getElementById("radiusInput"),
      applyImagesButton: document.getElementById("applyImagesButton"),
      undoPointButton: document.getElementById("undoPointButton"),
      clearPointsButton: document.getElementById("clearPointsButton"),
      loadStatusLabel: document.getElementById("loadStatusLabel"),
      editorStatusMessage: document.getElementById("editorStatusMessage"),
      pointCount: document.getElementById("pointCount"),
      activePointLabel: document.getElementById("activePointLabel"),
      lastPointLabel: document.getElementById("lastPointLabel"),
      pointList: document.getElementById("pointList"),
      showDifferencesButton: document.getElementById("showDifferencesButton"),
      showLevelButton: document.getElementById("showLevelButton"),
      exportOutput: document.getElementById("exportOutput"),
      copyCurrentButton: document.getElementById("copyCurrentButton"),
      refreshExportButton: document.getElementById("refreshExportButton")
    };

    this.boards = {
      A: {
        key: "A",
        frame: document.getElementById("editorFrameA"),
        image: document.getElementById("editorImageA"),
        overlay: document.getElementById("editorOverlayA"),
        status: document.getElementById("editorFrameStatusA"),
        imageSize: null,
        currentLayout: null
      },
      B: {
        key: "B",
        frame: document.getElementById("editorFrameB"),
        image: document.getElementById("editorImageB"),
        overlay: document.getElementById("editorOverlayB"),
        status: document.getElementById("editorFrameStatusB"),
        imageSize: null,
        currentLayout: null
      }
    };
    this.loadRequestId = 0;

    this.populateLevels();
    this.bindEvents();
    if (LEVELS.length) {
      this.loadLevel(0);
    }
  }

  EditorApp.prototype.populateLevels = function () {
    var self = this;
    this.refs.levelSelect.innerHTML = "";
    LEVELS.forEach(function (level, index) {
      var option = document.createElement("option");
      option.value = String(index);
      option.textContent = (index + 1) + ". " + (level.title || level.levelId);
      self.refs.levelSelect.appendChild(option);
    });
  };

  EditorApp.prototype.normalizeActivePointIndex = function () {
    if (!this.state.points.length) {
      this.state.activePointIndex = null;
      return;
    }

    if (this.state.activePointIndex === null || typeof this.state.activePointIndex !== "number") {
      return;
    }

    this.state.activePointIndex = Shared.clamp(this.state.activePointIndex, 0, this.state.points.length - 1);
  };

  EditorApp.prototype.setGlobalStatus = function (kind, label, message) {
    this.refs.loadStatusLabel.textContent = label;
    this.refs.loadStatusLabel.dataset.kind = kind;
    this.refs.editorStatusMessage.textContent = message;
    this.refs.editorStatusMessage.dataset.kind = kind;
  };

  EditorApp.prototype.setBoardStatus = function (board, kind, message) {
    board.frame.classList.toggle("editor-frame--loading", kind === "loading");
    board.frame.classList.toggle("editor-frame--error", kind === "error");
    board.status.textContent = message || "";
    board.status.classList.toggle("hidden", !message);
    board.status.dataset.kind = kind || "idle";
  };

  EditorApp.prototype.resetBoardImage = function (board, kind, message) {
    board.frame.classList.remove("editor-frame--interacting");
    board.image.removeAttribute("src");
    board.image.style.width = "";
    board.image.style.height = "";
    board.image.style.left = "";
    board.image.style.top = "";
    board.overlay.innerHTML = "";
    board.imageSize = null;
    board.currentLayout = null;
    this.setBoardStatus(board, kind || "idle", message || "");
  };

  EditorApp.prototype.resetPreviewState = function (options) {
    var messages = (options && options.boardMessages) || {};
    var kind = (options && options.kind) || "idle";

    this.state.ready = false;
    this.state.view = createViewState();
    this.state.gesture = createGestureState();
    this.state.lastPoint = null;

    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      var boardMessage = messages[key] || "";
      this.resetBoardImage(board, kind === "error" ? "error" : "idle", boardMessage);
    }, this);
  };

  EditorApp.prototype.getReloadableSrc = function (src, requestId) {
    var separator = src.indexOf("?") === -1 ? "?" : "&";
    return src + separator + "__editorReload=" + encodeURIComponent(String(requestId));
  };

  EditorApp.prototype.preloadImage = function (src) {
    return new Promise(function (resolve, reject) {
      var image = new window.Image();
      var settled = false;

      function finishSuccess() {
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      }

      function finishError() {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error("Image failed to load: " + src));
      }

      image.onload = finishSuccess;
      image.onerror = finishError;
      image.src = src;

      if (image.complete && image.naturalWidth > 0) {
        finishSuccess();
      }
    });
  };

  EditorApp.prototype.getSafeRequiredDifferences = function () {
    if (!this.state.points.length) {
      return 0;
    }

    return Shared.clamp(
      Number(this.state.requiredDifferences || DEFAULT_REQUIRED_DIFFERENCES),
      1,
      this.state.points.length
    );
  };

  EditorApp.prototype.bindEvents = function () {
    var self = this;

    this.refs.loadSelectedLevelButton.addEventListener("click", function () {
      self.loadLevel(Number(self.refs.levelSelect.value || 0));
    });

    this.refs.createBlankButton.addEventListener("click", function () {
      self.state = {
        levelId: "level-new",
        title: "新关卡",
        summary: "",
        requiredDifferences: DEFAULT_REQUIRED_DIFFERENCES,
        imageA: "",
        imageB: "",
        points: [],
        lastPoint: null,
        activePointIndex: null,
        exportMode: self.state.exportMode,
        view: createViewState(),
        gesture: createGestureState(),
        ready: false
      };
      self.syncInputs();
      self.setGlobalStatus("idle", "等待载入", "空白配置已建立，填写图片路径后点击“应用图片”。");
      self.applyImages();
      self.renderPoints();
      self.refreshExport();
    });

    this.refs.applyImagesButton.addEventListener("click", function () {
      self.pullInputsIntoState();
      self.applyImages();
      self.refreshExport();
    });

    this.refs.undoPointButton.addEventListener("click", function () {
      if (!self.state.points.length) {
        return;
      }
      self.state.points.pop();
      self.normalizeActivePointIndex();
      self.renderPoints();
      self.refreshExport();
    });

    this.refs.clearPointsButton.addEventListener("click", function () {
      self.state.points = [];
      self.state.lastPoint = null;
      self.state.activePointIndex = null;
      self.renderPoints();
      self.refreshExport();
    });

    this.refs.showDifferencesButton.addEventListener("click", function () {
      self.setExportMode("differences");
    });

    this.refs.showLevelButton.addEventListener("click", function () {
      self.setExportMode("level");
    });

    this.refs.copyCurrentButton.addEventListener("click", function () {
      Shared.copyText(self.refs.exportOutput.value).then(function () {
        self.refs.copyCurrentButton.textContent = "已复制";
        window.setTimeout(function () {
          self.refs.copyCurrentButton.textContent = "复制当前输出";
        }, 900);
      });
    });

    this.refs.refreshExportButton.addEventListener("click", function () {
      self.refreshExport();
    });

    this.refs.pointList.addEventListener("click", function (event) {
      var removeButton = event.target.closest("[data-remove-index]");
      if (removeButton) {
        var removeIndex = Number(removeButton.dataset.removeIndex);
        self.state.points.splice(removeIndex, 1);
        if (self.state.activePointIndex === removeIndex) {
          self.state.activePointIndex = null;
        } else if (self.state.activePointIndex > removeIndex) {
          self.state.activePointIndex -= 1;
        }
        self.normalizeActivePointIndex();
        self.renderPoints();
        self.refreshExport();
        return;
      }

      var item = event.target.closest("[data-point-index]");
      if (item) {
        self.selectPoint(Number(item.dataset.pointIndex));
      }
    });

    this.refs.pointList.addEventListener("focusin", function (event) {
      var item = event.target.closest("[data-point-index]");
      if (item) {
        self.selectPoint(Number(item.dataset.pointIndex));
      }
    });

    this.refs.pointList.addEventListener("input", function (event) {
      var item = event.target.closest("[data-point-index]");
      if (!item) {
        return;
      }
      var index = Number(item.dataset.pointIndex);
      var point = self.state.points[index];
      if (!point) {
        return;
      }

      if (event.target.name === "point-radius") {
        point.radius = Shared.clamp(Number(event.target.value || point.radius), 0.01, 0.2);
      } else if (event.target.name === "point-id") {
        point.id = event.target.value || point.id;
      }

      self.state.activePointIndex = index;
      self.renderPoints();
      self.refreshExport();
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
      self.renderPreviewPoints();
    });
  };

  EditorApp.prototype.setExportMode = function (mode) {
    this.state.exportMode = mode;
    this.refs.showDifferencesButton.classList.toggle("export-mode__button--active", mode === "differences");
    this.refs.showLevelButton.classList.toggle("export-mode__button--active", mode === "level");
    this.refreshExport();
  };

  EditorApp.prototype.selectPoint = function (index) {
    this.state.activePointIndex = index;
    this.renderPoints();
  };

  EditorApp.prototype.loadLevel = function (index) {
    var level = LEVELS[index];
    if (!level) {
      return;
    }

    this.state.levelId = level.levelId;
    this.state.title = level.title || "";
    this.state.summary = level.summary || "";
    this.state.requiredDifferences = typeof level.requiredDifferences === "number"
      ? level.requiredDifferences
      : DEFAULT_REQUIRED_DIFFERENCES;
    this.state.imageA = level.imageA.replace("./", "../");
    this.state.imageB = level.imageB.replace("./", "../");
    this.state.points = cloneDifferences(level.differences);
    this.state.lastPoint = null;
    this.state.activePointIndex = this.state.points.length ? 0 : null;
    this.state.view = createViewState();
    this.state.gesture = createGestureState();
    this.state.ready = false;

    this.syncInputs();
    this.setGlobalStatus("loading", "载入中", "正在载入所选关卡的预览图片...");
    this.applyImages();
    this.renderPoints();
    this.refreshExport();
  };

  EditorApp.prototype.pullInputsIntoState = function () {
    this.state.levelId = this.refs.levelIdInput.value.trim() || "level-new";
    this.state.title = this.refs.titleInput.value.trim();
    this.state.summary = this.refs.summaryInput.value.trim();
    this.state.imageA = this.refs.imageAInput.value.trim();
    this.state.imageB = this.refs.imageBInput.value.trim();
  };

  EditorApp.prototype.syncInputs = function () {
    this.refs.levelIdInput.value = this.state.levelId;
    this.refs.titleInput.value = this.state.title;
    this.refs.summaryInput.value = this.state.summary;
    this.refs.imageAInput.value = this.state.imageA;
    this.refs.imageBInput.value = this.state.imageB;
    this.refs.pointCount.textContent = String(this.state.points.length);
    this.refs.activePointLabel.textContent = this.getActivePointLabel();
    this.refs.lastPointLabel.textContent = this.state.lastPoint || "-";
  };

  EditorApp.prototype.getActivePointLabel = function () {
    if (this.state.activePointIndex === null || !this.state.points[this.state.activePointIndex]) {
      return "-";
    }

    var point = this.state.points[this.state.activePointIndex];
    return point.id + " | r=" + Shared.formatNumber(point.radius);
  };

  EditorApp.prototype.loadBoardImage = function (board, src) {
    var self = this;
    var requestId = this.loadRequestId;

    if (!src) {
      this.resetBoardImage(board, "idle", "填写图片路径后点击“应用图片”。");
      return Promise.resolve({
        board: board.key,
        ok: false,
        empty: true
      });
    }

    var reloadableSrc = this.getReloadableSrc(src, requestId);
    this.setBoardStatus(board, "loading", "正在载入图片 " + board.key + "...");

    return this.preloadImage(reloadableSrc).then(function (size) {
      if (requestId !== self.loadRequestId) {
        return {
          board: board.key,
          ok: false,
          stale: true
        };
      }

      board.image.src = reloadableSrc;
      board.imageSize = size;
      board.currentLayout = null;
      self.setBoardStatus(board, "success", "");
      return {
        board: board.key,
        ok: true,
        size: size
      };
    }).catch(function () {
      if (requestId !== self.loadRequestId) {
        return {
          board: board.key,
          ok: false,
          stale: true
        };
      }

      self.resetBoardImage(board, "error", "图片 " + board.key + " 载入失败");
      return {
        board: board.key,
        ok: false,
        error: "图片 " + board.key + " 载入失败，请检查路径并重新应用。"
      };
    });
  };

  EditorApp.prototype.applyImages = function () {
    var self = this;
    this.pullInputsIntoState();
    this.loadRequestId += 1;

    this.resetPreviewState({
      boardMessages: {
        A: this.state.imageA ? "正在准备图片 A..." : "填写图片路径后点击“应用图片”。",
        B: this.state.imageB ? "正在准备图片 B..." : "填写图片路径后点击“应用图片”。"
      }
    });
    this.setGlobalStatus("loading", "载入中", "正在刷新预览图片...");

    Promise.all([
      this.loadBoardImage(this.boards.A, this.state.imageA),
      this.loadBoardImage(this.boards.B, this.state.imageB)
    ]).then(function (results) {
      if (results.some(function (item) { return item && item.stale; })) {
        return;
      }

      var failed = results.filter(function (item) {
        return item && item.error;
      });
      var loaded = results.filter(function (item) {
        return item && item.ok;
      });
      var allLoaded = results.length > 0 && loaded.length === results.length;

      self.state.ready = allLoaded;

      if (failed.length) {
        self.setGlobalStatus("error", "载入失败", failed.map(function (item) {
          return item.error;
        }).join(" "));
      } else if (!allLoaded) {
        self.setGlobalStatus("idle", "等待载入", "填写图片路径后点击“应用图片”，或直接载入已有配置。");
      } else {
        self.setGlobalStatus("success", "已就绪", "预览已刷新，可继续拖拽、缩放和录点。");
      }

      self.renderPreviewPoints();
      self.syncInputs();
    });
  };

  EditorApp.prototype.getBoardFrameSize = function (board) {
    var rect = board.frame.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height
    };
  };

  EditorApp.prototype.getBoardMetrics = function (board, zoom) {
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

  EditorApp.prototype.clampViewCenter = function () {
    if (!this.state.ready) {
      return;
    }

    var minX = 0;
    var maxX = 1;
    var minY = 0;
    var maxY = 1;
    var zoom = this.state.view.zoom;

    Object.keys(this.boards).forEach(function (key) {
      var board = this.boards[key];
      if (!board.imageSize) {
        return;
      }
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

  EditorApp.prototype.getBoardLayout = function (board) {
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

  EditorApp.prototype.applyBoardLayout = function (board, layout) {
    board.image.style.width = layout.displayWidth + "px";
    board.image.style.height = layout.displayHeight + "px";
    board.image.style.left = layout.left + "px";
    board.image.style.top = layout.top + "px";
    board.currentLayout = layout;
  };

  EditorApp.prototype.localToImageNormalized = function (board, localPoint, layout) {
    return {
      x: Shared.clamp((localPoint.x - layout.left) / layout.displayWidth, 0, 1),
      y: Shared.clamp((localPoint.y - layout.top) / layout.displayHeight, 0, 1)
    };
  };

  EditorApp.prototype.imageNormalizedToLocal = function (board, normalizedPoint, layout) {
    return {
      x: layout.left + normalizedPoint.x * layout.displayWidth,
      y: layout.top + normalizedPoint.y * layout.displayHeight
    };
  };

  EditorApp.prototype.getProjectedRadius = function (point, layout) {
    return point.radius * Math.min(layout.displayWidth, layout.displayHeight);
  };

  EditorApp.prototype.renderPreviewPoints = function () {
    var self = this;

    Object.keys(this.boards).forEach(function (key) {
      var board = self.boards[key];
      board.overlay.innerHTML = "";
      if (!board.imageSize) {
        return;
      }
      self.clampViewCenter();
      self.applyBoardLayout(board, self.getBoardLayout(board));
    });

    if (!this.state.ready) {
      this.syncInputs();
      return;
    }

    Object.keys(this.boards).forEach(function (key) {
      var board = self.boards[key];
      self.state.points.forEach(function (point, index) {
        var marker = Shared.createEl("div", "editor-point");
        if (index === self.state.activePointIndex) {
          marker.classList.add("editor-point--active");
        }
        var center = self.imageNormalizedToLocal(board, point, board.currentLayout);
        var radius = self.getProjectedRadius(point, board.currentLayout);
        var badge = Shared.createEl("span", "editor-point__badge", String(index + 1));
        var centerDot = Shared.createEl("span", "editor-point__dot");

        marker.style.left = center.x + "px";
        marker.style.top = center.y + "px";
        marker.style.width = radius * 2 + "px";
        marker.style.height = radius * 2 + "px";
        marker.appendChild(centerDot);
        marker.appendChild(badge);
        board.overlay.appendChild(marker);
      });
    });

    this.syncInputs();
  };

  EditorApp.prototype.addPointFromLocal = function (board, localPoint) {
    if (!this.state.ready || !board.currentLayout) {
      return;
    }

    var point = this.localToImageNormalized(board, localPoint, board.currentLayout);
    var radius = Shared.clamp(Number(this.refs.radiusInput.value || 0.05), 0.01, 0.2);
    var nextIndex = this.state.points.length + 1;

    this.state.points.push({
      id: "diff-" + String(nextIndex).padStart(2, "0"),
      x: Number(point.x.toFixed(4)),
      y: Number(point.y.toFixed(4)),
      radius: Number(radius.toFixed(4))
    });

    this.state.lastPoint = board.key + " (" + Shared.formatNumber(point.x) + ", " + Shared.formatNumber(point.y) + ")";
    this.state.activePointIndex = this.state.points.length - 1;
    this.renderPoints();
    this.refreshExport();
  };

  EditorApp.prototype.renderPoints = function () {
    var self = this;
    this.normalizeActivePointIndex();
    this.refs.pointList.innerHTML = "";

    if (!this.state.points.length) {
      this.refs.pointList.appendChild(Shared.createEl("div", "empty-state", "还没有录入任何点位。"));
    }

    this.state.points.forEach(function (point, index) {
      var row = Shared.createEl("div", "point-row");
      row.dataset.pointIndex = String(index);
      if (index === self.state.activePointIndex) {
        row.classList.add("point-row--active");
      }

      var meta = Shared.createEl("div", "point-row__meta");
      var idInput = document.createElement("input");
      idInput.name = "point-id";
      idInput.value = point.id;

      var coord = Shared.createEl(
        "small",
        "",
        "x: " + Shared.formatNumber(point.x) + " | y: " + Shared.formatNumber(point.y)
      );

      meta.appendChild(idInput);
      meta.appendChild(coord);

      var radiusInput = document.createElement("input");
      radiusInput.type = "number";
      radiusInput.step = "0.005";
      radiusInput.min = "0.01";
      radiusInput.max = "0.2";
      radiusInput.name = "point-radius";
      radiusInput.value = String(point.radius);
      radiusInput.className = "point-row__radius";

      var removeButton = Shared.createEl("button", "button button--ghost", "删除");
      removeButton.type = "button";
      removeButton.dataset.removeIndex = String(index);

      row.appendChild(meta);
      row.appendChild(radiusInput);
      row.appendChild(removeButton);
      self.refs.pointList.appendChild(row);
    });

    this.refs.pointCount.textContent = String(this.state.points.length);
    this.refs.activePointLabel.textContent = this.getActivePointLabel();
    this.refs.lastPointLabel.textContent = this.state.lastPoint || "-";
    this.renderPreviewPoints();
  };

  EditorApp.prototype.buildExportObject = function () {
    this.pullInputsIntoState();
    return {
      levelId: this.state.levelId,
      requiredDifferences: this.getSafeRequiredDifferences(),
      title: this.state.title,
      summary: this.state.summary,
      imageA: this.state.imageA.replace("../", "./"),
      imageB: this.state.imageB.replace("../", "./"),
      differences: this.state.points.map(function (point) {
        return {
          id: point.id,
          x: Number(point.x),
          y: Number(point.y),
          radius: Number(point.radius)
        };
      })
    };
  };

  EditorApp.prototype.buildDifferencesBlock = function (indent) {
    if (!this.state.points.length) {
      return indent + "differences: []";
    }

    var lines = [indent + "differences: ["];
    this.state.points.forEach(function (point, index, array) {
      var line = formatPointLine(point, indent + "  ");
      if (index < array.length - 1) {
        line += ",";
      }
      lines.push(line);
    });
    lines.push(indent + "]");
    return lines.join("\n");
  };

  EditorApp.prototype.buildLevelObjectBlock = function () {
    var exportObject = this.buildExportObject();
    var lines = [
      "{",
      "  levelId: " + formatJsString(exportObject.levelId) + ","
    ];

    if (exportObject.requiredDifferences > 0) {
      lines.push("  requiredDifferences: " + exportObject.requiredDifferences + ",");
    }

    lines = lines.concat([
      "  title: " + formatJsString(exportObject.title) + ","
    ]);

    if (exportObject.summary) {
      lines.push("  summary: " + formatJsString(exportObject.summary) + ",");
    }

    lines.push("  imageA: " + formatJsString(exportObject.imageA) + ",");
    lines.push("  imageB: " + formatJsString(exportObject.imageB) + ",");
    lines.push(this.buildDifferencesBlock("  "));
    lines.push("}");
    return lines.join("\n");
  };

  EditorApp.prototype.buildExportPayload = function () {
    if (this.state.exportMode === "level") {
      return this.buildLevelObjectBlock();
    }
    return this.buildDifferencesBlock("");
  };

  EditorApp.prototype.refreshExport = function () {
    this.refs.exportOutput.value = this.buildExportPayload();
  };

  EditorApp.prototype.onPointerDown = function (event, board) {
    if (!this.state.ready || !board.currentLayout) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    var gesture = this.state.gesture;
    if (gesture.activeBoard && gesture.activeBoard !== board.key && gesture.pointers.size) {
      return;
    }

    var localPoint = Shared.getLocalPoint(event, board.frame);
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
    board.frame.classList.add("editor-frame--interacting");
    board.frame.setPointerCapture(event.pointerId);

    if (gesture.pointers.size === 2) {
      gesture.pointers.forEach(function (pointer) {
        pointer.tapEligible = false;
      });
      this.startPinchGesture(board);
    }
  };

  EditorApp.prototype.startPinchGesture = function (board) {
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

  EditorApp.prototype.onPointerMove = function (event, board) {
    var gesture = this.state.gesture;
    var pointer = gesture.pointers.get(event.pointerId);

    if (!pointer || gesture.activeBoard !== board.key || !this.state.ready) {
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

  EditorApp.prototype.panBy = function (board, deltaX, deltaY) {
    if (!board.currentLayout) {
      return;
    }

    this.state.view.centerX -= deltaX / board.currentLayout.displayWidth;
    this.state.view.centerY -= deltaY / board.currentLayout.displayHeight;
    this.renderPreviewPoints();
  };

  EditorApp.prototype.updatePinchGesture = function (board) {
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
    this.renderPreviewPoints();
  };

  EditorApp.prototype.setViewCenterForAnchor = function (board, localPoint, anchor) {
    var metrics = this.getBoardMetrics(board, this.state.view.zoom);
    this.state.view.centerX = anchor.x + (metrics.frameWidth / 2 - localPoint.x) / metrics.displayWidth;
    this.state.view.centerY = anchor.y + (metrics.frameHeight / 2 - localPoint.y) / metrics.displayHeight;
  };

  EditorApp.prototype.onPointerUpOrCancel = function (event, board) {
    var gesture = this.state.gesture;
    var pointer = gesture.pointers.get(event.pointerId);

    if (!pointer) {
      if (!gesture.pointers.size) {
        board.frame.classList.remove("editor-frame--interacting");
      }
      return;
    }

    var localPoint = Shared.getLocalPoint(event, board.frame);
    var wasTap = pointer.tapEligible && gesture.pointers.size === 1 && gesture.activeBoard === board.key;

    gesture.pointers.delete(event.pointerId);
    if (!gesture.pointers.size) {
      gesture.activeBoard = null;
      gesture.pinchStart = null;
      board.frame.classList.remove("editor-frame--interacting");
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
      this.addPointFromLocal(board, localPoint);
    }
  };

  EditorApp.prototype.onWheel = function (event, board) {
    if (!this.state.ready || !board.currentLayout) {
      return;
    }

    event.preventDefault();
    var localPoint = Shared.getLocalPoint(event, board.frame);
    var anchor = this.localToImageNormalized(board, localPoint, board.currentLayout);
    var zoomFactor = Math.exp(-event.deltaY * 0.00125);
    this.state.view.zoom = Shared.clamp(this.state.view.zoom * zoomFactor, 1, this.state.view.maxZoom);
    this.setViewCenterForAnchor(board, localPoint, anchor);
    this.renderPreviewPoints();
  };

  window.addEventListener("DOMContentLoaded", function () {
    window.spotDiffEditor = new EditorApp();
  });
})();
