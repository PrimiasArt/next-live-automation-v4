# Next Live Automation v4 - Cloud SaaS Broadcast Engine
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install Python, FFmpeg, and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirement files first for layer caching
COPY requirements.txt /app/
RUN pip3 install --no-cache-dir -r requirements.txt psutil

# Copy application files
COPY . /app

# Expose Web Port
EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/auth/me || exit 0

CMD ["python3", "run.py"]
