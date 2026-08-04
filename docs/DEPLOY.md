# Deploying

One process, one port. Express serves the built client and the WebSocket server
rides the same HTTP server, so there is exactly one systemd unit and one nginx
block.

## On the VPS

```bash
git clone https://github.com/Eth-Interchained/games-with-words.git
cd games-with-words
pnpm install          # or npm install
pnpm build            # builds the client into dist/
node scripts/build-static.mjs   # optional: the pass-and-play single file
```

There is **no server build step** — Node 22+ runs the TypeScript directly via
native type stripping. `npm start` is `node server/index.ts`.

### Pick a port

Ports already in use on the box: `3129` (nedb-studio), `3201–3203`
(salon-platform), `5000`/`8000` (aias), `7070` (nedbd). This ships defaulting to
**3210**.

### Generate a room secret

```bash
openssl rand -hex 32
```

Put it in `ROOM_SECRET`. Without it the secret is randomised per boot, and every
restart kicks every in-flight game back to the home screen.

## systemd

`deploy/games-with-words.service` — copy to `/etc/systemd/system/`, edit the
paths, user, and `PUBLIC_URL`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now games-with-words
sudo systemctl status games-with-words
journalctl -u games-with-words -f
```

## nginx — read this part

`deploy/nginx.conf` is a drop-in for `conf.d`. **The WebSocket upgrade headers
are not optional.**

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3210;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

Without `proxy_http_version 1.1` and those two headers, nginx silently
downgrades the upgrade request. The symptom is not an error — the lobby loads,
the QR code renders, players join, and then **nothing ever happens**. It looks
exactly like an application bug and it is not. If the game freezes at the lobby
in production, check this first.

`proxy_read_timeout` matters too: table talk has no timer, and a default 60s
read timeout will drop the socket mid-story.

On a Mail-in-a-Box host, nginx is managed — use the custom config hook rather
than dropping files into `sites-enabled` directly.

### Cloudflare

WebSockets must be enabled on the zone (Network → WebSockets). They are on by
default for all plans, but confirm it. Flexible SSL works; the browser speaks
`wss://` to Cloudflare and Cloudflare speaks `ws://` to origin, and the client
picks its scheme from `location.protocol`, so this needs no configuration.

Do not put the game behind "Under Attack" mode — the interstitial breaks the
socket handshake.

## Verify the deployment

```bash
# 1. process is up
curl -s https://YOUR_HOST/health
# {"ok":true,"rooms":0,"players":0,"protocol":1,"uptime":...}

# 2. the client is served
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_HOST/

# 3. a deep link resolves to the SPA
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_HOST/j/ABCD

# 4. THE ONE THAT MATTERS — the socket actually upgrades
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://YOUR_HOST/ws
# expect 101. Anything else means nginx ate the upgrade.
```

## Updating

```bash
git pull
pnpm install
pnpm build
sudo systemctl restart games-with-words
```

Restarting ends in-flight games. With `ROOM_SECRET` set, players who reconnect
after a restart get a clean "that game has ended" rather than a broken screen.

## Public URL and the QR code

`PUBLIC_URL` is baked into the QR code and the share link, so it must be the
address a **phone on the same wifi** can reach — not `localhost`. Set it to the
real https origin.

## Resource profile

Rooms are in memory, capped at 10 players, reaped six hours after creation or
immediately when the last player leaves. A room holding a full seven-round game
is a few tens of kilobytes. This will run comfortably alongside everything else
on the box.
