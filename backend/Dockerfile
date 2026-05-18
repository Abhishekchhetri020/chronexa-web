# Chronexa Web — FastAPI + OR-Tools backend.
#
# Single-stage build. OR-Tools ships as a binary wheel, so a multi-stage build
# wouldn't shrink the image (no toolchain to discard). We keep the layers
# minimal and order them for cache-friendliness: requirements.txt first, app
# code second.

FROM python:3.12-slim

# System: only what's needed for runtime + curl for the healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Layer 1: dependencies. Changes rarely → cached across rebuilds.
COPY app/requirements.txt /srv/app/requirements.txt
RUN pip install --no-cache-dir -r /srv/app/requirements.txt

# Layer 2: app code.
COPY app /srv/app

# Run as a non-root user.
RUN useradd --create-home --shell /bin/bash chronexa \
    && chown -R chronexa:chronexa /srv
USER chronexa

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8001/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
