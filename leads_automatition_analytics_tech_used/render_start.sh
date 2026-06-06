#!/bin/bash
# Render start script — ensures PORT env var is used
exec uvicorn api_cloud:app --host 0.0.0.0 --port ${PORT:-8000}
