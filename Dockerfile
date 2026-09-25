# ==============================================================================
# EduVault Production Dockerfile
# Optimized multi-layer build with non-root security and healthcheck
# ==============================================================================
FROM python:3.13-slim AS base

# Set environment flags
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install minimal OS dependencies for network & health checking
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged application user
RUN groupadd -g 1001 eduvault && \
    useradd -u 1001 -g eduvault -s /bin/bash -m eduvault

WORKDIR /app

# Install Python dependencies first for optimal Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy all platform source files
COPY . .

# Set correct ownership for database and runtime directories
RUN chown -R eduvault:eduvault /app

# Switch to non-root user
USER eduvault

# Expose HTTP port
EXPOSE 8000

# Docker healthcheck against the API health status endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Production server start with Uvicorn ASGI
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
