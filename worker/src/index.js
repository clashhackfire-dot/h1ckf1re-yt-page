/**
 * PulseTube Cloudflare Worker
 * Proxies requests to Piped instances with automatic fallback, CORS, and basic rate limiting.
 */

const INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party"
];

// Cache successful instance for a short time (per isolate)
let preferredInstance = null;
let preferredUntil = 0;
const PREFERRED_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Simple in-memory rate limit (best-effort, resets on isolate recycle)
const rateMap = new Map();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

/**
 * Very basic rate limiting by IP.
 */
function checkRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  let entry = rateMap.get(ip);

  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    entry = { start: now, count: 0 };
    rateMap.set(ip, entry);
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return false;
  }
  return true;
}

/**
 * Extract clean video ID (11 chars).
 */
function sanitizeVideoId(id) {
  if (!id || typeof id !== "string") return null;
  const cleaned = id.trim().slice(0, 20);
  if (!/^[\w-]{11}$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Try each Piped instance until one succeeds.
 */
async function fetchFromPiped(path, timeoutMs = 12000) {
  const instances = [];
  const now = Date.now();

  // Prefer last successful instance if still valid
  if (preferredInstance && now < preferredUntil) {
    instances.push(preferredInstance);
  }

  // Then the rest
  for (const inst of INSTANCES) {
    if (inst !== preferredInstance) instances.push(inst);
  }

  let lastError = "All Piped instances are currently unavailable.";

  for (const base of instances) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "PulseTube/1.0 (Cloudflare Worker; +https://github.com)",
          Accept: "application/json"
        }
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `Instance ${base} returned ${res.status}`;
        continue;
      }

      const data = await res.json();

      // Basic validation that we got streams data
      if (!data || (typeof data === "object" && data.error)) {
        lastError = data?.error || "Invalid response from Piped";
        continue;
      }

      // Success – remember this instance
      preferredInstance = base;
      preferredUntil = Date.now() + PREFERRED_TTL_MS;

      return data;
    } catch (err) {
      clearTimeout(timer);
      lastError = err.name === "AbortError" ? `Timeout contacting ${base}` : err.message;
      continue;
    }
  }

  throw new Error(lastError);
}

/**
 * Normalize Piped streams response into a cleaner shape for the frontend.
 */
function normalizeStreams(raw, videoId) {
  return {
    id: videoId,
    title: raw.title || "",
    description: raw.description || "",
    uploader: raw.uploader || raw.channel || "",
    uploaderUrl: raw.uploaderUrl || "",
    thumbnailUrl: raw.thumbnailUrl || (raw.thumbnail ? raw.thumbnail : ""),
    duration: raw.duration || 0,
    views: raw.views || 0,
    uploadDate: raw.uploadDate || raw.uploadedDate || null,
    livestream: !!raw.livestream,
    hls: raw.hls || null,
    videoStreams: (raw.videoStreams || []).map((s) => ({
      url: s.url,
      quality: s.quality,
      format: s.format,
      mimeType: s.mimeType,
      codec: s.codec,
      bitrate: s.bitrate,
      fps: s.fps,
      width: s.width,
      height: s.height,
      contentLength: s.contentLength || s.size || 0,
      videoOnly: !!s.videoOnly
    })),
    audioStreams: (raw.audioStreams || []).map((s) => ({
      url: s.url,
      quality: s.quality,
      format: s.format,
      mimeType: s.mimeType,
      codec: s.codec,
      bitrate: s.bitrate,
      contentLength: s.contentLength || s.size || 0
    }))
  };
}

async function handleInfo(request) {
  const url = new URL(request.url);
  const id = sanitizeVideoId(url.searchParams.get("id") || url.searchParams.get("v"));

  if (!id) {
    return errorResponse("Missing or invalid video ID. Provide ?id=VIDEO_ID");
  }

  try {
    const raw = await fetchFromPiped(`/streams/${id}`);
    const normalized = normalizeStreams(raw, id);
    return jsonResponse(normalized);
  } catch (err) {
    return errorResponse(err.message || "Failed to fetch video information", 502);
  }
}

async function handleDownload(request) {
  // Optional endpoint – frontend uses direct stream URLs from /api/info.
  // This can be used for future proxying if needed.
  const url = new URL(request.url);
  const id = sanitizeVideoId(url.searchParams.get("id"));
  const quality = url.searchParams.get("quality") || "best";

  if (!id) {
    return errorResponse("Missing or invalid video ID");
  }

  try {
    const raw = await fetchFromPiped(`/streams/${id}`);
    const normalized = normalizeStreams(raw, id);

    let stream = null;
    if (quality === "audio" || quality === "best-audio") {
      stream = (normalized.audioStreams || []).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    } else {
      const q = quality.replace(/p$/i, "") + "p";
      stream = (normalized.videoStreams || []).find((s) => s.quality?.startsWith(q.replace("p", ""))) ||
               (normalized.videoStreams || []).sort((a, b) => parseInt(b.quality) - parseInt(a.quality))[0];
    }

    if (!stream || !stream.url) {
      return errorResponse("Requested quality not available", 404);
    }

    return jsonResponse({
      id,
      quality: stream.quality || quality,
      url: stream.url,
      format: stream.format,
      size: stream.contentLength
    });
  } catch (err) {
    return errorResponse(err.message || "Failed to resolve download", 502);
  }
}

function handleHealth() {
  return new Response("OK", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      ...CORS_HEADERS
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    // Rate limit
    if (!checkRateLimit(request)) {
      return errorResponse("Rate limit exceeded. Please wait a moment.", 429);
    }

    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    if (request.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    try {
      if (path === "/health" || path === "/api/health") {
        return handleHealth();
      }
      if (path === "/api/info") {
        return await handleInfo(request);
      }
      if (path === "/api/download") {
        return await handleDownload(request);
      }

      // Root – simple info
      if (path === "/" || path === "") {
        return jsonResponse({
          name: "PulseTube API",
          version: "1.0.0",
          endpoints: ["/api/info?id=VIDEO_ID", "/api/download?id=VIDEO_ID&quality=720p", "/health"]
        });
      }

      return errorResponse("Not found", 404);
    } catch (err) {
      console.error("Unhandled error:", err);
      return errorResponse("Internal server error", 500);
    }
  }
};
