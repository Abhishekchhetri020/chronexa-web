FROM python:3.13-slim

# Pull the backend code from the public GitHub repo at build time so this Space
# never drifts from the source. Bump CODE_REV to force a fresh fetch on rebuild.
ARG REPO=https://raw.githubusercontent.com/Abhishekchhetri020/chronexa-web/main/backend
ARG CODE_REV=1

WORKDIR /app
ADD ${REPO}/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
ADD ${REPO}/solver_cpsat.py ./solver_cpsat.py
ADD ${REPO}/server.py ./server.py

# Tuned for a free 2-vCPU Hugging Face CPU Space. Override in Space Settings.
ENV PORT=7860 \
    CHRONEXA_WORKERS=2 \
    CHRONEXA_MIN_SECONDS=180

EXPOSE 7860
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
