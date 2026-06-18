FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY solver_cpsat.py server.py ./
ENV PORT=7860
# Render/Fly inject $PORT; Hugging Face uses 7860. Bind to whatever is set.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
