# PulseTube Cloudflare Worker

Lightweight backend that proxies requests to public Piped instances with automatic failover, CORS support, and basic rate limiting.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/info?id=VIDEO_ID` | Returns normalized video metadata + stream URLs |
| `GET` | `/api/download?id=VIDEO_ID&quality=720p` | Returns a single download URL for the requested quality |
| `GET` | `/health` | Health check – returns `OK` |

## Local Development

```bash
cd worker
npm install
npx wrangler dev
```

The worker will be available at `http://localhost:8787`.

## Deploy

```bash
cd worker
npm install
npx wrangler deploy
```

After deployment you will receive a URL like:

```
https://pulsetube-api.<your-subdomain>.workers.dev
```

Copy this URL into the frontend `config.js` → `API_BASE`.

## Configuration

Edit the `INSTANCES` array in `src/index.js` to add or remove Piped API endpoints.

The worker automatically remembers the last successful instance for 5 minutes to reduce latency.

## Security Notes

- Input is strictly validated (only 11-character YouTube video IDs are accepted).
- Rate limiting is applied per client IP (30 requests / minute, best-effort).
- CORS is open (`*`) so the GitHub Pages frontend can call it. You can restrict `Access-Control-Allow-Origin` if desired.
- The worker never proxies arbitrary URLs – only known Piped `/streams/` endpoints.

## License

MIT
