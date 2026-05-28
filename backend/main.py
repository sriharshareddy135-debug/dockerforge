import os
import subprocess
import shutil
import tempfile
import json
import re
import asyncio
from pathlib import Path
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="DockerForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


class ForgeRequest(BaseModel):
    github_url: str


def scan_repo(repo_path: str) -> dict:
    """Scan repository and collect relevant file info."""
    result = {
        "structure": [],
        "key_files": {},
        "languages": set(),
    }

    important_files = [
        "package.json", "requirements.txt", "Pipfile", "pyproject.toml",
        "setup.py", "go.mod", "go.sum", "Cargo.toml", "pom.xml",
        "build.gradle", "Gemfile", "composer.json", "mix.exs",
        ".nvmrc", ".python-version", "runtime.txt",
        "Makefile", "CMakeLists.txt", "build.sh", "start.sh",
        "app.py", "main.py", "server.py", "index.js", "app.js",
        "server.js", "index.ts", "app.ts", "main.go", "main.rs",
        "Application.java", "Program.cs",
    ]

    extensions_to_lang = {
        ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
        ".go": "Go", ".rs": "Rust", ".java": "Java", ".cs": "C#",
        ".rb": "Ruby", ".php": "PHP", ".cpp": "C++", ".c": "C",
    }

    for root, dirs, files in os.walk(repo_path):
        # Skip hidden dirs and common non-source dirs
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in
                   ['node_modules', '__pycache__', '.git', 'vendor', 'dist', 'build', '.venv', 'venv']]

        rel_root = os.path.relpath(root, repo_path)
        for f in files:
            rel_path = os.path.join(rel_root, f) if rel_root != '.' else f
            result["structure"].append(rel_path)

            # Detect language
            ext = Path(f).suffix
            if ext in extensions_to_lang:
                result["languages"].add(extensions_to_lang[ext])

            # Read important files
            if f in important_files:
                full_path = os.path.join(root, f)
                try:
                    with open(full_path, 'r', errors='ignore') as fp:
                        content = fp.read(3000)  # max 3KB per file
                    result["key_files"][rel_path] = content
                except Exception:
                    pass

    result["languages"] = list(result["languages"])
    return result


async def call_gemini(prompt: str) -> str:
    """Call Gemini API and return text response."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048}
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


def extract_dockerfile(text: str) -> str:
    """Extract Dockerfile content from LLM response."""
    # Try code block first
    match = re.search(r"```(?:dockerfile|docker)?\n([\s\S]+?)```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # If no code block, return cleaned text
    lines = [l for l in text.strip().split('\n') if not l.strip().startswith('#!')]
    return '\n'.join(lines).strip()


def build_analysis_prompt(repo_info: dict, github_url: str) -> str:
    structure_sample = '\n'.join(repo_info['structure'][:80])
    key_files_text = ""
    for fname, content in repo_info['key_files'].items():
        key_files_text += f"\n--- {fname} ---\n{content}\n"

    return f"""You are DockerForge, an expert DevOps AI. Analyze this GitHub repository and generate a production-ready Dockerfile.

Repository URL: {github_url}
Detected Languages: {', '.join(repo_info['languages']) or 'Unknown'}

File Structure (first 80 files):
{structure_sample}

Key Configuration Files:
{key_files_text or 'None found'}

TASK: Generate a complete, working Dockerfile for this project.

Rules:
1. Use an appropriate base image with a specific version tag (not 'latest')
2. Set WORKDIR to /app
3. Copy dependency files first (for layer caching), then install, then copy source
4. Expose the correct port
5. Include a proper CMD or ENTRYPOINT
6. Use multi-stage build if appropriate (e.g., for compiled languages)
7. Add LABEL maintainer and description
8. Ensure the build will succeed without manual intervention
9. Handle common pitfalls (e.g., apt-get update before install, pip --no-cache-dir)

Also generate a docker-compose.yml if the project has a database or multiple services.

Respond with ONLY the Dockerfile content in a markdown code block, followed by the docker-compose.yml (if needed) in a separate code block. No explanations before or after.
"""


def build_fix_prompt(dockerfile: str, error_output: str, attempt: int) -> str:
    return f"""You are DockerForge. A Dockerfile build failed. Fix it.

ATTEMPT: {attempt}/3

CURRENT DOCKERFILE:
```dockerfile
{dockerfile}
```

BUILD ERROR OUTPUT:
```
{error_output[-3000:]}
```

Analyze the error carefully and provide a FIXED Dockerfile. Common fixes:
- Wrong base image or tag
- Missing system dependencies
- Wrong package manager commands
- Permission issues (add chmod or use root)
- Missing environment variables
- Wrong COPY paths
- apt-get needs 'apt-get update && apt-get install -y' 
- Node apps need npm ci or npm install before copying all files

Respond with ONLY the fixed Dockerfile in a ```dockerfile code block. Nothing else.
"""


async def stream_forge(github_url: str) -> AsyncGenerator[str, None]:
    """Main agent loop — streams SSE events."""

    def event(type_: str, data: dict) -> str:
        return f"data: {json.dumps({'type': type_, **data})}\n\n"

    yield event("status", {"message": "🔍 Cloning repository..."})

    # Step 1: Clone
    tmpdir = tempfile.mkdtemp()
    try:
        clone_result = subprocess.run(
            ["git", "clone", "--depth=1", github_url, tmpdir],
            capture_output=True, text=True, timeout=120
        )
        if clone_result.returncode != 0:
            yield event("error", {"message": f"Git clone failed: {clone_result.stderr[:500]}"})
            return

        yield event("status", {"message": "📂 Scanning repository structure..."})

        # Step 2: Scan
        repo_info = scan_repo(tmpdir)
        yield event("scan", {
            "languages": repo_info["languages"],
            "file_count": len(repo_info["structure"]),
            "key_files": list(repo_info["key_files"].keys())
        })

        yield event("status", {"message": f"🧠 Analyzing with Gemini AI ({len(repo_info['structure'])} files found)..."})

        # Step 3: Generate Dockerfile with Gemini
        prompt = build_analysis_prompt(repo_info, github_url)
        try:
            llm_response = await call_gemini(prompt)
        except Exception as e:
            yield event("error", {"message": f"Gemini API error: {str(e)}"})
            return

        dockerfile = extract_dockerfile(llm_response)

        # Extract docker-compose if present
        compose_match = re.search(r"```(?:yaml|yml)?\n([\s\S]+?)```", llm_response)
        compose_content = compose_match.group(1).strip() if compose_match else None

        yield event("dockerfile_generated", {
            "dockerfile": dockerfile,
            "compose": compose_content
        })

        # Step 4: Write Dockerfile and attempt build
        dockerfile_path = os.path.join(tmpdir, "Dockerfile")
        with open(dockerfile_path, 'w') as f:
            f.write(dockerfile)

        if compose_content:
            with open(os.path.join(tmpdir, "docker-compose.yml"), 'w') as f:
                f.write(compose_content)

        # Generate a safe image tag from URL
        image_tag = re.sub(r'[^a-z0-9]', '-', github_url.lower().split('github.com/')[-1])
        image_tag = f"dockerforge-{image_tag[:40]}:latest"

        max_attempts = 3
        build_success = False
        final_dockerfile = dockerfile

        for attempt in range(1, max_attempts + 1):
            yield event("status", {"message": f"🐳 Building Docker image (attempt {attempt}/{max_attempts})..."})

            build_proc = subprocess.run(
                ["docker", "build", "-t", image_tag, "."],
                capture_output=True, text=True, timeout=300, cwd=tmpdir
            )

            build_output = build_proc.stdout + "\n" + build_proc.stderr

            yield event("build_output", {
                "attempt": attempt,
                "output": build_output[-4000:],
                "success": build_proc.returncode == 0
            })

            if build_proc.returncode == 0:
                build_success = True
                final_dockerfile = open(dockerfile_path).read()
                yield event("status", {"message": f"✅ Build succeeded on attempt {attempt}!"})
                break
            else:
                if attempt < max_attempts:
                    yield event("status", {"message": f"❌ Build failed. Asking Gemini to fix... (attempt {attempt})"})
                    fix_prompt = build_fix_prompt(
                        open(dockerfile_path).read(),
                        build_output,
                        attempt
                    )
                    try:
                        fix_response = await call_gemini(fix_prompt)
                        fixed_dockerfile = extract_dockerfile(fix_response)
                        with open(dockerfile_path, 'w') as f:
                            f.write(fixed_dockerfile)
                        yield event("dockerfile_fixed", {
                            "attempt": attempt,
                            "dockerfile": fixed_dockerfile
                        })
                    except Exception as e:
                        yield event("error", {"message": f"Fix generation failed: {str(e)}"})
                        break
                else:
                    yield event("status", {"message": "❌ Build failed after 3 attempts."})

        # Step 6: Run container verification
        if build_success:
            yield event("status", {"message": "🚀 Verifying container starts correctly..."})

            # Try to run container briefly to check startup
            run_proc = subprocess.run(
                ["docker", "run", "--rm", "-d", "--name", f"dockerforge-test-{os.getpid()}", image_tag],
                capture_output=True, text=True, timeout=30
            )

            if run_proc.returncode == 0:
                container_id = run_proc.stdout.strip()
                # Wait a moment then check it's still running
                await asyncio.sleep(3)
                ps_proc = subprocess.run(
                    ["docker", "ps", "--filter", f"id={container_id}", "--format", "{{.Status}}"],
                    capture_output=True, text=True
                )
                is_running = bool(ps_proc.stdout.strip())

                # Stop test container
                subprocess.run(["docker", "stop", container_id], capture_output=True)

                yield event("run_result", {
                    "success": is_running,
                    "message": "Container started and is running!" if is_running else "Container started but exited quickly (may be a short-lived process)"
                })
            else:
                yield event("run_result", {
                    "success": False,
                    "message": f"Container failed to start: {run_proc.stderr[:500]}"
                })

            # Clean up image
            subprocess.run(["docker", "rmi", image_tag], capture_output=True)

        # Final result
        yield event("complete", {
            "success": build_success,
            "final_dockerfile": final_dockerfile,
            "compose": compose_content
        })

    except Exception as e:
        yield event("error", {"message": f"Unexpected error: {str(e)}"})
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.post("/forge")
async def forge(req: ForgeRequest):
    if not req.github_url.startswith("https://github.com/"):
        raise HTTPException(status_code=400, detail="Must be a valid GitHub URL")

    return StreamingResponse(
        stream_forge(req.github_url),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/health")
async def health():
    return {"status": "ok", "gemini_configured": bool(GEMINI_API_KEY)}
