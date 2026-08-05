/**
 * PulseTube Configuration
 * Edit these values after deploying your Cloudflare Worker and GitHub Pages site.
 */

const CONFIG = {
  // Replace with your deployed Cloudflare Worker URL (no trailing slash)
  // Example: "https://pulsetube-api.yourname.workers.dev"
  API_BASE: "https://pulsetube-2487.hackfire850.workers.dev",

  // Website branding
  SITE_NAME: "PulseTube",
  SITE_TAGLINE: "Free YouTube Video & Audio Downloader",

  // Theme colors (used as CSS custom properties)
  THEME: {
    primary: "#ff0000",
    primaryDark: "#cc0000",
    accent: "#00d4ff",
    bgLight: "#f8fafc",
    bgDark: "#0f172a",
    cardLight: "#ffffff",
    cardDark: "#1e293b",
    textLight: "#1e293b",
    textDark: "#f1f5f9"
  },

  // Client-side cache duration for video info (ms)
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  // Request timeout (ms)
  REQUEST_TIMEOUT: 55000
};

// Freeze to prevent accidental mutation
Object.freeze(CONFIG);
Object.freeze(CONFIG.THEME);
