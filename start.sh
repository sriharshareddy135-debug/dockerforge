#!/bin/bash
set -e

# Start nginx (frontend)
nginx

# Start FastAPI backend
exec uvicorn main:app --host 0.0.0.0 --port 8000
