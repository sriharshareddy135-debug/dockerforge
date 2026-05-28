# 🔥 DockerForge — AI-Powered Dockerfile Generator

> Give it a GitHub repo. Get a working Dockerfile. Automatically.

DockerForge is an agentic AI tool that clones a GitHub repository, analyzes its structure, generates a production-ready Dockerfile using **Google Gemini 2.0 Flash**, builds the Docker image, and verifies the container runs — all autonomously, with up to 3 self-healing retry attempts on build failure.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DockerForge Agent                        │
│                                                                 │
│  User Input                                                     │
│  (GitHub URL)                                                   │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────┐    ┌──────────┐    ┌─────────────────────────┐   │
│  │  Clone  │───▶│   Scan   │───▶│   Gemini 2.0 Flash AI   │   │
│  │  Repo   │    │  Files   │    │  (Dockerfile generation) │   │
│  └─────────┘    └──────────┘    └────────────┬────────────┘   │
│                                               │                 │
│                                               ▼                 │
│                                    ┌──────────────────┐        │
│                                    │  docker build .  │        │
│                                    └────────┬─────────┘        │
│                                             │                   │
│                                    ┌────────▼─────────┐        │
│                                    │  Build OK?        │        │
│                                    └────────┬─────────┘        │
│                          YES ◀──────────────┤                   │
│                           │          NO (retry ≤3)             │
│                           │           │                         │
│                           │    ┌──────▼────────┐               │
│                           │    │ Gemini fixes  │               │
│                           │    │  Dockerfile   │               │
│                           │    └──────┬────────┘               │
│                           │           └──────────────┐          │
│                           ▼                          ▼          │
│                  ┌─────────────────┐     (loop back to build)  │
│                  │  docker run     │                            │
│                  │  (verify start) │                            │
│                  └────────┬────────┘                           │
│                           │                                     │
│                           ▼                                     │
│                  ✅ Final Dockerfile shown in UI                │
└─────────────────────────────────────────────────────────────────┘

Tech Stack:
  Frontend:  React 18 + custom terminal-aesthetic UI (nginx)
  Backend:   FastAPI (Python 3.11) + streaming SSE
  AI:        Google Gemini 2.0 Flash API
  Docker:    Docker CLI (mounted via socket)
  Transport: Server-Sent Events (real-time streaming)
```

---

## Features

| Feature | Description |
|---------|-------------|
| 🔍 **Repo Analysis** | Scans file structure, detects languages, reads config files (package.json, requirements.txt, go.mod, etc.) |
| 🧠 **AI Generation** | Gemini 2.0 Flash generates a Dockerfile tailored to the repo's stack |
| 🐳 **Auto Build** | Runs `docker build` inside the container (via Docker socket) |
| 🔄 **Self-Healing** | On failure, feeds the error back to Gemini for a fix — up to 3 attempts |
| 🚀 **Container Verify** | Runs `docker run` to confirm the container starts |
| 📡 **Live Streaming** | All steps stream in real-time via SSE to the UI |
| 🎨 **Terminal UI** | Syntax-highlighted Dockerfile viewer, step progress, build logs |

---

## Setup & Running

### Prerequisites

- Docker and Docker Compose installed
- A Google Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

### Option A — Docker Compose (Recommended)

```bash
# 1. Clone this repo
git clone https://github.com/YOUR_USERNAME/dockerforge.git
cd dockerforge

# 2. Set your API key
export GEMINI_API_KEY=your_key_here

# 3. Start everything
docker-compose up --build

# Frontend → http://localhost:3000
# Backend  → http://localhost:8000
```

### Option B — Single Container

```bash
docker build -t dockerforge .

docker run -d \
  -p 3000:80 \
  -p 8000:8000 \
  -e GEMINI_API_KEY=your_key_here \
  -v /var/run/docker.sock:/var/run/docker.sock \
  dockerforge
```

### Option C — Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
GEMINI_API_KEY=your_key uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install --legacy-peer-deps
REACT_APP_API_URL=http://localhost:8000 npm start
```

---

## Usage

1. Open `http://localhost:3000`
2. Paste a public GitHub repository URL
3. Click **⚡ Forge**
4. Watch the agent work in real-time
5. Copy the final Dockerfile

### Test Repositories

| Level | Repo | Stack |
|-------|------|-------|
| Easy | `https://github.com/pallets/flask` | Python/Flask |
| Medium | `https://github.com/tiangolo/fastapi` | Python/FastAPI |
| Medium | `https://github.com/expressjs/express` | Node.js |
| Hard | `https://github.com/gin-gonic/gin` | Go |

---

## LLM Provider: Google Gemini 2.0 Flash

**Why Gemini?**

- **Speed**: Flash model is optimized for low-latency tasks — critical for a real-time agent loop
- **Code quality**: Excellent at understanding monorepos, multi-language stacks, and dependency files
- **Context window**: 1M token window means we can send large file structures without truncation
- **Free tier**: Generous free tier for development and testing
- **Structured output**: Reliably returns code in markdown blocks for easy extraction

The model is prompted with the full repository structure, detected languages, and contents of key config files. On failure, the complete error output is fed back for targeted fixes.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check + Gemini key status |
| `POST` | `/forge` | Start forge agent (SSE stream) |

### POST /forge

**Request:**
```json
{ "github_url": "https://github.com/owner/repo" }
```

**SSE Event Types:**

| Event | Payload | Description |
|-------|---------|-------------|
| `status` | `{ message }` | Human-readable status update |
| `scan` | `{ languages, file_count, key_files }` | Repo analysis results |
| `dockerfile_generated` | `{ dockerfile, compose? }` | Initial AI-generated Dockerfile |
| `build_output` | `{ attempt, output, success }` | Docker build stdout/stderr |
| `dockerfile_fixed` | `{ attempt, dockerfile }` | AI-fixed Dockerfile after failure |
| `run_result` | `{ success, message }` | Container run verification |
| `complete` | `{ success, final_dockerfile, compose? }` | Final result |
| `error` | `{ message }` | Fatal error |

---

## Known Limitations & Edge Cases

| Limitation | Notes |
|------------|-------|
| **Private repos** | Only public GitHub repos are supported (no auth) |
| **Docker-in-Docker** | Requires the Docker socket to be mounted — won't work in rootless Docker or Podman without config |
| **Build time** | Large repos or slow base image pulls can exceed the 5-min timeout |
| **Multi-service apps** | Generates a basic docker-compose.yml for detected databases, but complex orchestration may need manual tuning |
| **Monorepos** | Scans up to 80 files in the structure listing; very deep monorepos may miss sub-project configs |
| **OS-specific deps** | If the app requires specific OS libraries (e.g., CUDA, GPU drivers), the generated Dockerfile may need manual adjustment |
| **Max 3 retries** | If the build fails all 3 attempts (e.g., due to flaky network or missing private dependencies), the raw best-attempt Dockerfile is shown |
| **Port detection** | Attempts to infer the exposed port from source code; defaults to 8000/3000/80 if not found |

---

## Project Structure

```
dockerforge/
├── backend/
│   ├── main.py            # FastAPI app + agent logic
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js         # React UI
│   │   └── index.js
│   ├── public/index.html
│   ├── nginx.conf
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml     # Multi-container setup
├── Dockerfile             # Single-container build
├── start.sh               # Single-container startup
└── README.md
```

---

## License

MIT — build something great.
