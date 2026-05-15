(function (root) {
  var DEFAULT_CONFIG = {
    apiBaseUrl: "https://leaderboard.liruochen.cn",
    campaignId: "zgca-admission",
    gameId: "zgca-spot-the-diff",
    timeoutMs: 5000
  };

  function createConfig(overrides) {
    var config = {
      apiBaseUrl: DEFAULT_CONFIG.apiBaseUrl,
      campaignId: DEFAULT_CONFIG.campaignId,
      gameId: DEFAULT_CONFIG.gameId,
      timeoutMs: DEFAULT_CONFIG.timeoutMs
    };

    if (!overrides) {
      return config;
    }

    if (typeof overrides.apiBaseUrl === "string" && overrides.apiBaseUrl.trim()) {
      config.apiBaseUrl = overrides.apiBaseUrl.trim();
    }
    if (typeof overrides.campaignId === "string" && overrides.campaignId.trim()) {
      config.campaignId = overrides.campaignId.trim();
    }
    if (typeof overrides.gameId === "string" && overrides.gameId.trim()) {
      config.gameId = overrides.gameId.trim();
    }
    if (typeof overrides.timeoutMs === "number" && overrides.timeoutMs > 0) {
      config.timeoutMs = overrides.timeoutMs;
    }

    return config;
  }

  function normalizeUserId(value) {
    if (typeof value !== "string") {
      return null;
    }

    var trimmed = value.trim();
    return trimmed || null;
  }

  function resolveSearch(input) {
    if (!input) {
      return root.location && typeof root.location.search === "string"
        ? root.location.search
        : "";
    }

    if (typeof input === "string") {
      if (!input) {
        return "";
      }
      if (input.charAt(0) === "?") {
        return input;
      }

      try {
        return new URL(
          input,
          root.location && root.location.href ? root.location.href : "https://example.invalid"
        ).search;
      } catch (error) {
        var queryIndex = input.indexOf("?");
        return queryIndex >= 0 ? input.slice(queryIndex) : "";
      }
    }

    if (typeof input.search === "string") {
      return input.search;
    }

    return "";
  }

  function parseAccessContext(input, overrides) {
    var search = resolveSearch(input);
    var params = new URLSearchParams(search);
    var userId = normalizeUserId(params.get("user_id"));
    var config = createConfig(overrides);

    return {
      search: search,
      params: params,
      userId: userId,
      hasUserId: !!userId,
      mode: userId ? "admission" : "single-player",
      config: config
    };
  }

  function buildAdmissionPayload(context) {
    return {
      campaign_id: context.config.campaignId,
      game_id: context.config.gameId,
      user_id: context.userId
    };
  }

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function buildErrorMessage(status, data, text) {
    if (data && typeof data.detail === "string" && data.detail) {
      return data.detail;
    }
    if (data && typeof data.message === "string" && data.message) {
      return data.message;
    }
    if (typeof text === "string" && text) {
      return text;
    }
    if (status) {
      return "HTTP " + status;
    }
    return "Request failed";
  }

  function toSerializableError(error) {
    if (!error) {
      return null;
    }

    return {
      message: error.message || "Request failed",
      status: typeof error.status === "number" ? error.status : null,
      code: error.code || null,
      detail: error.responseData && (error.responseData.detail || error.responseData.message)
        ? String(error.responseData.detail || error.responseData.message)
        : null
    };
  }

  function normalizeGameStatusResponse(data) {
    return {
      cleared: !!(data && data.cleared === true),
      clearedAt: data && data.cleared_at ? data.cleared_at : null,
      rank: data && data.rank !== undefined && data.rank !== null ? data.rank : null,
      raw: data || null
    };
  }

  function normalizeRegisterClearResponse(data) {
    var gameStatusSource = data && data.game_status ? data.game_status : data;

    return {
      ok: true,
      message: data && typeof data.message === "string" ? data.message : null,
      gameStatus: normalizeGameStatusResponse(gameStatusSource),
      campaignStatus: data && data.campaign_status ? data.campaign_status : null,
      raw: data || null
    };
  }

  function hasClearedAllPlayableLevels(levels, completedLevelIds) {
    if (!Array.isArray(levels) || !levels.length) {
      return false;
    }

    var completedMap = {};
    (completedLevelIds || []).forEach(function (levelId) {
      if (levelId) {
        completedMap[levelId] = true;
      }
    });

    return levels.every(function (level) {
      return level && level.levelId && completedMap[level.levelId];
    });
  }

  function AdmissionClient(options) {
    options = options || {};

    this.baseUrl = (options.baseUrl || DEFAULT_CONFIG.apiBaseUrl).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl || (typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    this.timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_CONFIG.timeoutMs;
  }

  AdmissionClient.prototype.postJson = function (path, payload) {
    var self = this;

    if (!this.fetchImpl) {
      return Promise.reject(new Error("Fetch API unavailable"));
    }

    var controller = typeof root.AbortController === "function"
      ? new root.AbortController()
      : null;
    var timeoutId = null;

    if (controller && typeof root.setTimeout === "function" && this.timeoutMs > 0) {
      timeoutId = root.setTimeout(function () {
        controller.abort();
      }, this.timeoutMs);
    }

    function clearTimer() {
      if (timeoutId !== null && typeof root.clearTimeout === "function") {
        root.clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    return this.fetchImpl(this.baseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = text ? safeJsonParse(text) : null;

        if (!response.ok) {
          var requestError = new Error(buildErrorMessage(response.status, data, text));
          requestError.status = response.status;
          requestError.responseData = data;
          requestError.responseText = text;
          throw requestError;
        }

        return data || {};
      });
    }).then(function (data) {
      clearTimer();
      return data;
    }, function (error) {
      clearTimer();

      if (error && error.name === "AbortError") {
        var timeoutError = new Error("Request timed out");
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }

      throw error;
    });
  };

  AdmissionClient.prototype.getGameStatus = function (context) {
    return this.postJson("/api/admission/game_status", buildAdmissionPayload(context));
  };

  AdmissionClient.prototype.registerClear = function (context) {
    return this.postJson("/api/admission/register_clear", buildAdmissionPayload(context));
  };

  function AdmissionSync(options) {
    options = options || {};

    this.context = options.context || parseAccessContext(null, options.config);
    this.client = options.client || new AdmissionClient({
      baseUrl: this.context.config.apiBaseUrl,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl
    });
    this.logger = typeof options.logger === "function" ? options.logger : null;

    this.state = {
      enabled: !!this.context.hasUserId,
      queryAttempted: false,
      queryInFlight: false,
      querySucceeded: false,
      queryFailed: false,
      queryError: null,
      remoteCleared: false,
      remoteClearedAt: null,
      remoteRank: null,
      registerAttemptedThisSession: false,
      registerInFlight: false,
      registerSucceeded: false,
      registerFailed: false,
      registerError: null,
      lastRegisterMessage: null
    };
  }

  AdmissionSync.prototype.log = function (level, message, meta) {
    if (this.logger) {
      this.logger(level, message, meta || null);
    }
  };

  AdmissionSync.prototype.getState = function () {
    return {
      enabled: this.state.enabled,
      queryAttempted: this.state.queryAttempted,
      queryInFlight: this.state.queryInFlight,
      querySucceeded: this.state.querySucceeded,
      queryFailed: this.state.queryFailed,
      queryError: this.state.queryError,
      remoteCleared: this.state.remoteCleared,
      remoteClearedAt: this.state.remoteClearedAt,
      remoteRank: this.state.remoteRank,
      registerAttemptedThisSession: this.state.registerAttemptedThisSession,
      registerInFlight: this.state.registerInFlight,
      registerSucceeded: this.state.registerSucceeded,
      registerFailed: this.state.registerFailed,
      registerError: this.state.registerError,
      lastRegisterMessage: this.state.lastRegisterMessage,
      context: {
        userId: this.context.userId,
        hasUserId: this.context.hasUserId,
        mode: this.context.mode,
        config: createConfig(this.context.config)
      }
    };
  };

  AdmissionSync.prototype.bootstrap = function () {
    var self = this;

    if (!this.state.enabled) {
      return Promise.resolve({
        ok: false,
        skipped: "single-player",
        state: this.getState()
      });
    }

    if (this.state.queryInFlight) {
      return Promise.resolve({
        ok: false,
        skipped: "query-in-flight",
        state: this.getState()
      });
    }

    this.state.queryAttempted = true;
    this.state.queryInFlight = true;
    this.state.queryFailed = false;
    this.state.queryError = null;
    this.log("info", "Querying admission game status", buildAdmissionPayload(this.context));

    return this.client.getGameStatus(this.context).then(function (data) {
      var normalized = normalizeGameStatusResponse(data);

      self.state.queryInFlight = false;
      self.state.querySucceeded = true;
      self.state.remoteCleared = normalized.cleared;
      self.state.remoteClearedAt = normalized.clearedAt;
      self.state.remoteRank = normalized.rank;
      self.log("info", "Admission game status loaded", normalized);

      return {
        ok: true,
        data: normalized,
        state: self.getState()
      };
    }, function (error) {
      self.state.queryInFlight = false;
      self.state.queryFailed = true;
      self.state.querySucceeded = false;
      self.state.queryError = toSerializableError(error);
      self.log("warn", "Admission game status query failed", self.state.queryError);

      return {
        ok: false,
        error: self.state.queryError,
        state: self.getState()
      };
    });
  };

  AdmissionSync.prototype.maybeRegisterClear = function (options) {
    var self = this;
    var isAllLevelsCleared = !!(options && options.isAllLevelsCleared);

    if (!this.state.enabled) {
      return Promise.resolve({
        ok: false,
        skipped: "single-player",
        state: this.getState()
      });
    }

    if (!isAllLevelsCleared) {
      return Promise.resolve({
        ok: false,
        skipped: "not-all-levels-cleared",
        state: this.getState()
      });
    }

    if (this.state.remoteCleared) {
      return Promise.resolve({
        ok: false,
        skipped: "already-cleared-remote",
        state: this.getState()
      });
    }

    if (this.state.registerSucceeded) {
      return Promise.resolve({
        ok: false,
        skipped: "already-registered-this-session",
        state: this.getState()
      });
    }

    if (this.state.registerAttemptedThisSession || this.state.registerInFlight) {
      return Promise.resolve({
        ok: false,
        skipped: "register-already-attempted-this-session",
        state: this.getState()
      });
    }

    this.state.registerAttemptedThisSession = true;
    this.state.registerInFlight = true;
    this.state.registerFailed = false;
    this.state.registerError = null;
    this.log("info", "Registering admission clear", buildAdmissionPayload(this.context));

    return this.client.registerClear(this.context).then(function (data) {
      var normalized = normalizeRegisterClearResponse(data);

      self.state.registerInFlight = false;
      self.state.registerSucceeded = true;
      self.state.lastRegisterMessage = normalized.message;
      self.state.remoteCleared = normalized.gameStatus.cleared || self.state.remoteCleared;
      self.state.remoteClearedAt = normalized.gameStatus.clearedAt || self.state.remoteClearedAt;
      self.state.remoteRank = normalized.gameStatus.rank !== null
        ? normalized.gameStatus.rank
        : self.state.remoteRank;
      self.log("info", "Admission clear registered", normalized);

      return {
        ok: true,
        data: normalized,
        state: self.getState()
      };
    }, function (error) {
      self.state.registerInFlight = false;
      self.state.registerFailed = true;
      self.state.registerError = toSerializableError(error);
      self.log("warn", "Admission clear registration failed", self.state.registerError);

      return {
        ok: false,
        error: self.state.registerError,
        state: self.getState()
      };
    });
  };

  var api = {
    DEFAULT_CONFIG: createConfig(),
    createConfig: createConfig,
    parseAccessContext: parseAccessContext,
    buildAdmissionPayload: buildAdmissionPayload,
    normalizeGameStatusResponse: normalizeGameStatusResponse,
    normalizeRegisterClearResponse: normalizeRegisterClearResponse,
    hasClearedAllPlayableLevels: hasClearedAllPlayableLevels,
    AdmissionClient: AdmissionClient,
    AdmissionSync: AdmissionSync
  };

  root.SpotDiffAdmission = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
