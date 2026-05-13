(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(pointA, pointB) {
    var dx = pointA.x - pointB.x;
    var dy = pointA.y - pointB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function midpoint(pointA, pointB) {
    return {
      x: (pointA.x + pointB.x) / 2,
      y: (pointA.y + pointB.y) / 2
    };
  }

  function getLocalPoint(event, element) {
    var rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function pointInCircle(point, width, height) {
    var radius = Math.min(width, height) / 2;
    var centerX = width / 2;
    var centerY = height / 2;
    return distance(point, { x: centerX, y: centerY }) <= radius;
  }

  function toNormalizedPoint(event, element) {
    var rect = element.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function getCoverScale(containerWidth, containerHeight, imageWidth, imageHeight) {
    return Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
  }

  function getCoverMetrics(containerWidth, containerHeight, imageWidth, imageHeight, zoom) {
    var baseScale = getCoverScale(containerWidth, containerHeight, imageWidth, imageHeight);
    var scale = baseScale * zoom;
    return {
      baseScale: baseScale,
      scale: scale,
      displayWidth: imageWidth * scale,
      displayHeight: imageHeight * scale
    };
  }

  function onceImageLoaded(image, src) {
    return new Promise(function (resolve, reject) {
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
  }

  function createEl(tagName, className, textContent) {
    var element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (typeof textContent === "string") {
      element.textContent = textContent;
    }
    return element;
  }

  function formatNumber(value) {
    return Number(value).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textArea);
      }
    });
  }

  function showTemporaryClass(element, className, duration) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(function () {
      element.classList.remove(className);
    }, duration || 420);
  }

  function getQueryParams() {
    return new URLSearchParams(window.location.search);
  }

  window.SpotDiffShared = {
    clamp: clamp,
    distance: distance,
    midpoint: midpoint,
    getLocalPoint: getLocalPoint,
    pointInCircle: pointInCircle,
    toNormalizedPoint: toNormalizedPoint,
    getCoverScale: getCoverScale,
    getCoverMetrics: getCoverMetrics,
    onceImageLoaded: onceImageLoaded,
    createEl: createEl,
    formatNumber: formatNumber,
    copyText: copyText,
    showTemporaryClass: showTemporaryClass,
    getQueryParams: getQueryParams
  };
})();
