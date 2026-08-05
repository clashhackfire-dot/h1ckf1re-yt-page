/**
 * PulseTube Frontend Logic
 * Handles URL validation, API calls, UI updates, and theming.
 */

(function () {
  "use strict";

  // DOM references
  const $ = (sel) => document.querySelector(sel);
  const urlInput = $("#urlInput");
  const searchForm = $("#searchForm");
  const searchBtn = $("#searchBtn");
  const searchBtnText = $("#searchBtnText");
  const searchLoader = $("#searchLoader");
  const statusBox = $("#statusBox");
  const errorCard = $("#errorCard");
  const errorTitle = $("#errorTitle");
  const errorMsg = $("#errorMsg");
  const retryBtn = $("#retryBtn");
  const videoCard = $("#videoCard");
  const videoThumb = $("#videoThumb");
  const videoDuration = $("#videoDuration");
  const videoTitle = $("#videoTitle");
  const videoChannel = $("#videoChannel");
  const videoViews = $("#videoViews");
  const videoUpload = $("#videoUpload");
  const videoDesc = $("#videoDesc");
  const videoFormats = $("#videoFormats");
  const audioFormats = $("#audioFormats");
  const themeToggle = $("#themeToggle");
  const themeIcon = $("#themeIcon");
  const siteNameEl = $("#siteName");
  const siteTaglineEl = $("#siteTagline");

  // Apply config branding
  if (typeof CONFIG !== "undefined") {
    if (CONFIG.SITE_NAME) siteNameEl.textContent = CONFIG.SITE_NAME;
    if (CONFIG.SITE_TAGLINE) siteTaglineEl.textContent = CONFIG.SITE_TAGLINE;
  }

  // Simple in-memory + localStorage cache
  const cache = new Map();
  const CACHE_KEY_PREFIX = "pt_info_";

  // ---------- Theme ----------
  function getPreferredTheme() {
    const stored = localStorage.getItem("pt_theme");
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem("pt_theme", theme);
  }

  applyTheme(getPreferredTheme());

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // ---------- Helpers ----------
  function showStatus(message, type = "info") {
    statusBox.textContent = message;
    statusBox.className = `status visible status-${type}`;
  }

  function hideStatus() {
    statusBox.className = "status";
    statusBox.textContent = "";
  }

  function showError(title, message) {
    errorTitle.textContent = title;
    errorMsg.textContent = message;
    errorCard.classList.add("visible");
    videoCard.classList.remove("visible");
  }

  function hideError() {
    errorCard.classList.remove("visible");
  }

  function setLoading(isLoading) {
    searchBtn.disabled = isLoading;
    searchBtnText.classList.toggle("hidden", isLoading);
    searchLoader.classList.toggle("hidden", !isLoading);
  }

  /**
   * Extract YouTube video ID from various URL formats.
   * Supports: youtube.com/watch, youtu.be, shorts, embed, live (but live is rejected later).
   */
  function extractVideoId(url) {
    try {
      const u = new URL(url.trim());
      const host = u.hostname.replace(/^www\./, "");

      // Reject playlists early
      if (u.searchParams.has("list") && !u.searchParams.has("v")) {
        return { error: "Playlists are not supported. Please paste a single video link." };
      }

      if (host === "youtu.be") {
        const id = u.pathname.slice(1).split("/")[0];
        if (id && /^[\w-]{11}$/.test(id)) return { id };
      }

      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        // /watch?v=
        if (u.pathname === "/watch") {
          const id = u.searchParams.get("v");
          if (id && /^[\w-]{11}$/.test(id)) return { id };
        }
        // /shorts/ID
        if (u.pathname.startsWith("/shorts/")) {
          const id = u.pathname.split("/")[2];
          if (id && /^[\w-]{11}$/.test(id)) return { id };
        }
        // /embed/ID
        if (u.pathname.startsWith("/embed/")) {
          const id = u.pathname.split("/")[2];
          if (id && /^[\w-]{11}$/.test(id)) return { id };
        }
        // /live/ID – we still extract but will reject later if live
        if (u.pathname.startsWith("/live/")) {
          const id = u.pathname.split("/")[2];
          if (id && /^[\w-]{11}$/.test(id)) return { id, isLivePath: true };
        }
      }

      return { error: "Invalid YouTube URL. Supported: youtube.com, youtu.be, Shorts." };
    } catch {
      return { error: "Please enter a valid URL." };
    }
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatViews(n) {
    if (n == null) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B views";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K views";
    return n + " views";
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return "";
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + " KB";
    return bytes + " B";
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  // Preferred video qualities in display order
  const VIDEO_QUALITIES = ["1080p", "720p", "480p", "360p", "240p", "144p"];

  /**
   * Pick best streams for each quality (prefer mp4 / progressive when possible).
   */
  function processStreams(data) {
    const videoMap = new Map();
    const audioList = [];

    // Video streams (prefer non-videoOnly when available for progressive, but most are adaptive)
    (data.videoStreams || []).forEach((s) => {
      if (!s.url || !s.quality) return;
      // Normalize quality label (e.g. "720p" or "720p60")
      const q = s.quality.replace(/p60|p50|p30|p25|p24/, "p").replace(/\s+/g, "");
      const height = parseInt(q, 10) || 0;
      if (height < 144) return;

      // Prefer higher bitrate / better format
      const existing = videoMap.get(q);
      const score = (s.bitrate || 0) + (s.format === "MPEG_4" || s.mimeType?.includes("mp4") ? 10000 : 0);
      if (!existing || score > existing.score) {
        videoMap.set(q, {
          quality: q,
          url: s.url,
          format: s.format || s.mimeType || "video",
          size: s.contentLength || s.size || 0,
          fps: s.fps,
          codec: s.codec,
          videoOnly: s.videoOnly,
          score
        });
      }
    });

    // Audio streams – pick best overall + M4A preference
    let bestAudio = null;
    let bestM4A = null;

    (data.audioStreams || []).forEach((s) => {
      if (!s.url) return;
      const item = {
        quality: s.quality || (s.bitrate ? Math.round(s.bitrate / 1000) + " kbps" : "Audio"),
        url: s.url,
        format: s.format || "audio",
        size: s.contentLength || s.size || 0,
        bitrate: s.bitrate || 0,
        codec: s.codec,
        mimeType: s.mimeType
      };

      if (!bestAudio || item.bitrate > bestAudio.bitrate) bestAudio = item;
      if ((s.format === "M4A" || s.mimeType?.includes("mp4") || s.codec?.includes("mp4a")) &&
          (!bestM4A || item.bitrate > bestM4A.bitrate)) {
        bestM4A = item;
      }
    });

    if (bestAudio) audioList.push({ ...bestAudio, label: "Best Audio" });
    if (bestM4A && bestM4A.url !== bestAudio?.url) {
      audioList.push({ ...bestM4A, label: "M4A" });
    } else if (bestM4A) {
      // already added as best
    }

    // Sort video by quality descending
    const videos = VIDEO_QUALITIES
      .map((q) => videoMap.get(q))
      .filter(Boolean);

    // Also include any other qualities that appeared
    videoMap.forEach((v, q) => {
      if (!VIDEO_QUALITIES.includes(q)) videos.push(v);
    });
    videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

    return { videos, audios: audioList };
  }

  function renderFormats(container, items, type) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">No ${type} formats available.</p>`;
      return;
    }

    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "format-item";

      const label = type === "video" ? item.quality : (item.label || item.quality);
      const metaParts = [];
      if (item.format) metaParts.push(item.format);
      if (item.size) metaParts.push(formatSize(item.size));
      if (item.fps) metaParts.push(item.fps + " fps");

      div.innerHTML = `
        <div class="format-info">
          <span class="format-quality">${label}</span>
          <span class="format-meta">${metaParts.join(" · ")}</span>
        </div>
        <a class="btn btn-download" href="${item.url}" target="_blank" rel="noopener noreferrer" download>
          Download
        </a>
      `;
      container.appendChild(div);
    });
  }

  function displayVideo(data) {
    hideError();
    hideStatus();

    videoThumb.src = data.thumbnailUrl || data.thumbnail || "";
    videoThumb.alt = data.title || "Thumbnail";
    videoDuration.textContent = formatDuration(data.duration);
    videoTitle.textContent = data.title || "Untitled";
    videoChannel.textContent = data.uploader || data.channel || "Unknown channel";
    videoViews.textContent = formatViews(data.views);
    videoUpload.textContent = data.uploadDate ? "Uploaded " + formatDate(data.uploadDate) : "";
    videoDesc.textContent = data.description ? data.description.slice(0, 300) + (data.description.length > 300 ? "…" : "") : "";

    const { videos, audios } = processStreams(data);
    renderFormats(videoFormats, videos, "video");
    renderFormats(audioFormats, audios, "audio");

    videoCard.classList.add("visible");
    videoCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- API ----------
  async function fetchInfo(videoId) {
    const cacheKey = CACHE_KEY_PREFIX + videoId;
    const cached = cache.get(cacheKey) || (() => {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < (CONFIG?.CACHE_DURATION || 300000)) return parsed.data;
      } catch {}
      return null;
    })();

    if (cached) return cached;

    const apiBase = (typeof CONFIG !== "undefined" && CONFIG.API_BASE) ? CONFIG.API_BASE.replace(/\/$/, "") : "";
    if (!apiBase || apiBase.includes("YOUR_WORKER")) {
      throw new Error("API not configured. Please set CONFIG.API_BASE in config.js to your Cloudflare Worker URL.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG?.REQUEST_TIMEOUT || 20000);

    try {
      const res = await fetch(`${apiBase}/api/info?id=${encodeURIComponent(videoId)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Cache
      cache.set(cacheKey, data);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
      } catch {}

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
      throw err;
    }
  }

  // ---------- Main handler ----------
  async function handleSearch(url) {
    hideError();
    hideStatus();
    videoCard.classList.remove("visible");

    const extracted = extractVideoId(url);
    if (extracted.error) {
      showError("Invalid Link", extracted.error);
      return;
    }

    if (extracted.isLivePath) {
      showError("Live Streams Not Supported", "This appears to be a live stream. Please use a regular video URL.");
      return;
    }

    setLoading(true);
    showStatus("Fetching video information…", "info");

    try {
      const data = await fetchInfo(extracted.id);

      // Basic live detection from Piped response
      if (data.livestream || data.hls) {
        showError("Live Streams Not Supported", "Live streams cannot be downloaded with this tool.");
        return;
      }

      displayVideo(data);
      showStatus("Ready! Choose a format below.", "success");
    } catch (err) {
      console.error(err);
      showError("Could not load video", err.message || "Unknown error. Please try a different Piped instance or check the URL.");
    } finally {
      setLoading(false);
    }
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    handleSearch(url);
  });

  retryBtn.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url) handleSearch(url);
  });

  // Optional: auto-fill from query param ?url=
  const params = new URLSearchParams(window.location.search);
  const prefill = params.get("url") || params.get("v");
  if (prefill) {
    urlInput.value = prefill.includes("http") ? prefill : `https://www.youtube.com/watch?v=${prefill}`;
    handleSearch(urlInput.value);
  }
})();
