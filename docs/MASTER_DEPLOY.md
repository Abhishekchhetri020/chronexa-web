# Chronexa Web — Master deployment playbook

This ties together the frontend (GitHub Pages) + backend (Hostinger VPS) + free domain.

> **Target date: 20 May 2026** (when the Hostinger VPS becomes available).

## 0. What you'll need

- Hostinger VPS credentials (root SSH; 16 GB RAM, 200 GB SSD)
- Free domain name (from Hostinger; e.g. `chronexa.yourname.in` or similar)
- 30 minutes wall-time
- These are the ONLY external dependencies. Everything else is in this repo.

## 1. Frontend — already live

The frontend serves automatically from GitHub Pages:

**https://abhishekchhetri020.github.io/chronexa-web/**

No deployment needed. Every push to `main` updates it in ~60 seconds.

## 2. Backend on Hostinger VPS — one-time setup

```bash
# 1) SSH into the VPS
ssh root@<your-vps-ip>

# 2) Install Docker (Ubuntu 22.04 / 24.04)
apt-get update && apt-get install -y docker.io docker-compose-plugin git ufw certbot
systemctl enable --now docker

# 3) Configure firewall
ufw allow OpenSSH
ufw allow http
ufw allow https
ufw --force enable

# 4) Clone the repo
cd /opt
git clone https://github.com/Abhishekchhetri020/chronexa-web.git
cd chronexa-web/backend

# 5) Set environment variables
cp .env.example .env
# Edit .env with your domain name, contact email for Let's Encrypt, etc.
nano .env

# 6) First-run Let's Encrypt cert (HTTP-01 challenge)
docker compose --profile init-cert up certbot

# 7) Bring the stack up
docker compose up -d

# 8) Verify
curl https://<your-domain>/health
# Expected: {"status":"ok","version":"...","ortools_version":"..."}
```

## 3. Point the free domain at the VPS

In your Hostinger DNS panel:

- Add an **A record**: `@` → `<your-vps-ip>` (TTL 300)
- (Optional) Add an **A record**: `www` → `<your-vps-ip>`
- Wait 5-10 minutes for DNS propagation; check with `dig <your-domain> +short`

## 4. Connect frontend to backend

Edit the frontend config in this repo (one line):

```bash
# In js/ui/config.js (Agent A's file), set:
window.CHRONEXA_BACKEND_URL = "https://<your-domain>";
```

Push that change. GitHub Pages will pick it up in ~60 seconds.

## 5. Update procedure (future deploys)

```bash
ssh root@<your-vps-ip>
cd /opt/chronexa-web
git pull
cd backend
docker compose up -d --build      # rebuilds only changed images
docker compose logs -f app        # tail logs to confirm
```

## 6. Operational notes

| Concern | Where to look |
|---|---|
| Container logs | `docker compose logs app` |
| Disk usage | `df -h` (200 GB available; Docker images ~500 MB) |
| Memory usage | `docker stats` (FastAPI + OR-Tools ~1-2 GB under load) |
| Cert renewal | Certbot runs daily inside the stack |
| Backup | Code is in git; no stateful DB at v1 |
| Health alerts | (TBD) — wire UptimeRobot to https://<your-domain>/health |

## 7. Rolling back

```bash
cd /opt/chronexa-web
git log --oneline -10        # find the commit before the bad one
git checkout <good-commit>
cd backend
docker compose up -d --build
```

## 8. Costs

| Item | Cost / month |
|---|---|
| GitHub Pages | $0 |
| Hostinger VPS | included in your existing plan |
| Free domain | included in your existing plan |
| Let's Encrypt SSL | $0 |
| **TOTAL** | **$0** |

## 9. Capacity

A single VPS with 16 GB / 200 GB / 4 vCPU comfortably handles:

- Several hundred concurrent timetable viewers (frontend is static; nothing hits the VPS for browsing)
- ~10-20 concurrent `/solve` requests (each takes 5-60 s of CPU on OR-Tools)
- Storage for thousands of past timetables (only if you add a DB later; v1 is stateless)

For ≥10 schools, look at horizontal scaling later (Hostinger lets you upgrade in place).
