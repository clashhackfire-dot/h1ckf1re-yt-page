# PulseTube

**Free, open-source YouTube video & audio downloader**

Built with GitHub Pages (frontend) + Cloudflare Workers (backend) + Piped (public video data).

No YouTube account, no cookies, no tracking. Completely free to host.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-GitHub%20Pages%20%2B%20Cloudflare%20Workers-orange)

---

## Features

- Paste any YouTube / Shorts / youtu.be link
- View thumbnail, title, channel, duration, views
- Download video (144p → 1080p) or audio (best / M4A)
- Automatic fallback across multiple Piped instances
- Dark / light mode
- Fully responsive (phone, tablet, desktop)
- Zero cost to run

---

## Project Structure

```
/
├── index.html          # Main page
├── styles.css          # Modern responsive styles
├── script.js           # Frontend logic
├── config.js           # Configuration (API URL, branding)
├── 404.html
├── LICENSE
├── README.md
├── assets/
│   └── icons/
└── worker/
    ├── src/
    │   └── index.js    # Cloudflare Worker
    ├── wrangler.jsonc
    ├── package.json
    └── README.md
```

---

## Quick Start

### 1. Deploy the Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login          # one-time
npx wrangler deploy
```

Copy the resulting URL, e.g. `https://pulsetube-api.YOURNAME.workers.dev`.

### 2. Configure the Frontend

Open `config.js` and set:

```js
API_BASE: "https://pulsetube-api.YOURNAME.workers.dev",
```

Optionally change `SITE_NAME`, `SITE_TAGLINE`, and theme colors.

### 3. Deploy to GitHub Pages

1. Create a new GitHub repository and push this project.
2. Go to **Settings → Pages**.
3. Source: **Deploy from a branch** → `main` / `root` (or `/docs` if you prefer).
4. Wait a minute, then visit `https://YOURUSERNAME.github.io/REPO_NAME/`.

That’s it – the site is live.

---

## Supported URLs

| Type | Example |
|------|---------|
| Standard | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| Short link | `https://youtu.be/dQw4w9WgXcQ` |
| Shorts | `https://www.youtube.com/shorts/xxxxx` |
| Mobile | `https://m.youtube.com/watch?v=...` |

**Not supported:** playlists, live streams, private / members-only videos.

---

## How It Works

1. User pastes a YouTube URL.
2. Frontend extracts the 11-character video ID and calls the Worker (`/api/info`).
3. Worker tries a list of public Piped instances in order.
4. First successful response is normalized and returned (with CORS headers).
5. Frontend displays metadata and direct stream links from Piped.
6. User clicks Download → browser downloads directly from the Piped proxy URL.

No content is stored or re-hosted by PulseTube.

---

## Configuration Options

### Frontend (`config.js`)

| Key | Description |
|-----|-------------|
| `API_BASE` | Your Cloudflare Worker URL |
| `SITE_NAME` | Display name |
| `SITE_TAGLINE` | Subtitle under the title |
| `CACHE_DURATION` | Client-side cache for video info (ms) |
| `REQUEST_TIMEOUT` | Fetch timeout (ms) |

### Worker (`worker/src/index.js`)

Edit the `INSTANCES` array to change which Piped APIs are tried:

```js
const INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  // add more...
];
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| “API not configured” | Set `API_BASE` in `config.js` to your Worker URL |
| “All Piped instances unavailable” | Public instances can go offline. Add more instances or try again later |
| CORS errors | Make sure the Worker is deployed and returns the correct CORS headers |
| Empty formats | Some videos are region-restricted or have no progressive streams |
| Rate limited | Wait 60 seconds; the Worker limits ~30 requests per IP per minute |

### Checking Worker Health

```
curl https://YOUR_WORKER.workers.dev/health
```

Should return `OK`.

---

## FAQ

**Is this legal?**  
PulseTube only returns publicly available stream URLs provided by Piped. Downloading copyrighted material may violate YouTube’s Terms of Service or local law. Use responsibly and only for content you have rights to.

**Do I need a YouTube account?**  
No.

**Does it work with age-restricted or private videos?**  
Usually no – Piped relies on public extraction.

**Can I self-host Piped?**  
Yes. Point one of the `INSTANCES` entries to your own Piped API for better reliability.

**Why Cloudflare Workers?**  
Free tier is generous, global edge network, excellent cold-start performance, and built-in CORS handling.

---

## Screenshots

> Add your own screenshots after deployment:
> - Homepage (light & dark)
> - Video result card with formats
> - Mobile view

---

## Development

```bash
# Frontend – just open index.html or use any static server
npx serve .

# Worker
cd worker
npm install
npx wrangler dev
```

Update `config.js` temporarily to `http://localhost:8787` while testing.

---

## License

MIT – see [LICENSE](LICENSE).

---

## Disclaimer

PulseTube does not host any video or audio content.  
All media is served by third-party Piped instances.  
Respect creators and copyright law. For personal / educational use only.
