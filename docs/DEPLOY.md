# Hostinger VPS deploy — Chronexa Web backend

Target box: Hostinger VPS, Ubuntu 22.04 LTS, 16 GB RAM, 200 GB SSD, free
domain. Stack: Docker Compose with `app` (FastAPI + OR-Tools) behind
`nginx` (TLS + reverse proxy), with `certbot` for Let's Encrypt.

This walks you from a freshly-provisioned blank box to a working
`https://<your-domain>/health` in about 15 minutes.

---

## 0. What you provide on launch day

- The VPS root IP (e.g. `203.0.113.42`).
- The free Hostinger domain (e.g. `chronexa.<something>.com`).
- An email address for Let's Encrypt expiry notices.

Drop those into `.env` (see step 5) before bringing the stack up.

---

## 1. SSH in and bootstrap the box

```bash
ssh root@<VPS-IP>

apt update && apt upgrade -y
apt install -y curl ca-certificates git ufw
```

Add a non-root deploy user if you want (`adduser chronexa`, `usermod -aG sudo chronexa`), or stay as root for v1.

---

## 2. Install Docker + the Compose plugin

```bash
# Official Docker convenience script.
curl -fsSL https://get.docker.com | sh

# Compose v2 is bundled with the convenience script. Verify.
docker --version
docker compose version
```

Note: the file in this repo is named `docker-compose.yml` but `docker compose`
(v2, with a space) is the modern invocation. Both work.

---

## 3. Firewall (ufw)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

If your VPS provider has its own firewall layer (Hostinger does, in the panel),
mirror these rules there too.

---

## 4. DNS — point the domain at the VPS

In your DNS provider (Hostinger's panel for the free domain):

| Record | Name | Value           | TTL |
|--------|------|-----------------|-----|
| A      | @    | `<VPS-IP>`      | 300 |
| A      | www  | `<VPS-IP>`      | 300 |

Wait until `dig +short <your-domain>` resolves to the VPS IP from the box itself
before continuing. Let's Encrypt's HTTP-01 challenge needs this.

---

## 5. Clone the repo and configure env

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/Abhishekchhetri020/chronexa-web.git
cd chronexa-web/backend

cp .env.example .env
$EDITOR .env   # set DOMAIN= and ACME_EMAIL=
```

Then edit `nginx/default.conf` — change every `chronexa.example.com` to your
actual domain (both `server_name` lines AND the two `ssl_certificate` paths).

```bash
# Quick sed (BSD-ish; on Linux drop the empty '' arg):
sed -i "s/chronexa\.example\.com/${DOMAIN_FROM_ENV}/g" nginx/default.conf
```

---

## 6. Build the image (no startup yet)

```bash
docker compose build
```

This pulls `python:3.12-slim`, installs FastAPI + OR-Tools, copies the app.
Expected first build: ~3-4 min on a 16 GB VPS. Image lands at ~450-550 MB
(OR-Tools is fat).

---

## 7. First-time SSL certificate (Let's Encrypt)

The certbot service is included but inactive (`profile: tools`). For the
**first** cert acquisition, we need port 80 free for the HTTP-01 challenge —
nginx hasn't been started yet, so we can run certbot in `--standalone` mode.

```bash
# Stop anything bound to 80 on the host (nothing should be, on a fresh box).
docker compose run --rm --service-ports certbot certonly \
  --standalone \
  --email "$(grep ^ACME_EMAIL .env | cut -d= -f2)" \
  --agree-tos --no-eff-email \
  -d "$(grep ^DOMAIN .env | cut -d= -f2)"
```

When it finishes:

```bash
# Confirm the cert exists inside the named volume.
docker compose run --rm certbot ls /etc/letsencrypt/live/
```

You should see a folder named for your domain.

---

## 8. Bring the stack up

```bash
docker compose up -d
docker compose ps
```

You should see `app` (healthy) and `nginx` running. Tail logs once:

```bash
docker compose logs -f --tail=50 app nginx
```

---

## 9. Verify

```bash
# From the box.
curl -fsS https://<your-domain>/health
# {"status":"ok","version":"0.1.0","ortools_version":"9.15.6755"}

# HTTP→HTTPS redirect.
curl -sIv http://<your-domain>/health 2>&1 | grep -E '^< (HTTP|Location)'
# < HTTP/1.1 301 Moved Permanently
# < Location: https://<your-domain>/health
```

From your laptop, post a tiny solve request:

```bash
curl -fsS -X POST https://<your-domain>/solve \
  -H 'Content-Type: application/json' \
  -d @backend/test_fixture.json
```

---

## 10. Restart policy + boot survival

`docker-compose.yml` already sets `restart: unless-stopped` on `app` and
`nginx`. After a host reboot:

```bash
sudo reboot
# wait, SSH back in
docker compose ps           # should be "Up" automatically
curl -fsS https://<domain>/health
```

If Docker is set to start at boot (the convenience script does this), the stack
comes back without intervention.

---

## 11. Certificate renewal

Let's Encrypt certs are good for 90 days. Add a host cron job:

```bash
crontab -e
```

```cron
0 3 * * * cd /opt/chronexa-web/backend && docker compose run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload
```

(Daily; certbot itself only does work in the last 30 days of validity.)

---

## 12. Updates

```bash
cd /opt/chronexa-web
git pull
cd backend
docker compose up -d --build   # rebuilds the app image if Dockerfile/code changed
docker compose ps
curl -fsS https://<domain>/health
```

Zero-downtime is not configured (single replica) — there's a ~3-5 s gap during
restart. For a school-day solver, that's fine; bump to two replicas + nginx
upstream weighting if it becomes a problem.

---

## 13. Inspecting

```bash
# All logs.
docker compose logs --tail=200

# Just the app, follow.
docker compose logs -f app

# Just nginx.
docker compose logs -f nginx

# Health from inside the app container.
docker compose exec app curl -fsS http://127.0.0.1:8001/health
```

Each `/solve` request prints an `rid=<id>` and a duration. Grep that to trace a
specific solve:

```bash
docker compose logs app | grep rid=abcd1234ef
```

---

## 14. Resource expectations

- **Idle memory:** ~120-180 MB (app) + ~10 MB (nginx). The 4 GB cap in
  `docker-compose.yml` is the ceiling for one solve.
- **Solver memory peak:** OR-Tools scales with `lessons × periods × rooms`.
  A 60-teacher, 8-period, 30-class school typically peaks around 600-900 MB.
- **CPU:** the solver is single-threaded (we set `num_workers=1` for
  determinism). On a 4-vCPU VPS that means one solve at a time uses ~1 core.
  Concurrent `/solve` calls compete; rate-limiting at nginx caps it at
  30 req/min/IP.
- **Disk:** ~600 MB for the image + ~10 MB/day of logs. `docker system prune`
  monthly is plenty.

---

## 15. Troubleshooting

| Symptom                                | Try                                                                                  |
|----------------------------------------|--------------------------------------------------------------------------------------|
| `docker compose up` fails on port 80   | `lsof -iTCP:80 -sTCP:LISTEN` — kill it or change the host bind.                       |
| Cert acquisition 404 from LE           | DNS not propagated yet. `dig +short <domain>` must show VPS IP from the box.         |
| `app` keeps restarting                 | `docker compose logs --tail=200 app` — usually a Pydantic schema error in a request. |
| `/solve` always returns TIMEOUT        | School is over-constrained. Try `timeLimitSec=300`; check `violations` array.        |
| CORS error from the frontend           | Add the new origin to `CORS_ORIGINS` in `.env`, then `docker compose up -d`.         |

---

## What was NOT tested locally before this deploy

Docker is not installed on the build machine, so the local Mac smoke test
exercised the FastAPI + solver code in a Python 3.13 venv (passed:
`/health` returns 200, tiny `/solve` returns OPTIMAL in ~120 ms, CORS preflight
green for the GH Pages origin). The Docker image build itself is verified by
the GitHub Actions workflow (`.github/workflows/backend.yml`) — that workflow
runs `docker build` + a containerised health check on every push to
`backend/**`, so the first VPS pull is the first time the image runs on Linux
hardware but not the first time it's been built.
