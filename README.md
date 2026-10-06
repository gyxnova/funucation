# learn-by-song

Educational music videos where simple geometric shapes act out a concept while a song explains it. This repository is a scaffold: it includes a deterministic canvas timeline, a sample topic, and a small quiz API, but no finished art or music.

## Run locally (Windows PowerShell)

From the repository root, create and activate the Python environment, install the API dependencies, and create your local environment file:

```powershell
python -m venv .venv ; .\.venv\Scripts\Activate.ps1 ; pip install -r api/requirements.txt ; copy .env.example .env
```

Add an `OPENROUTER_API_KEY` to `.env` to enable quiz generation. Keep the key private and do not commit `.env`.

In the first terminal, start the API:

```powershell
cd api ; uvicorn main:app --reload --port 8000
```

In a second terminal, from the repository root, start the web app:

```powershell
cd web ; npm install ; npm run dev
```

Open the local URL printed by Vite. Requests to `/api` are proxied to the API server. The API health check is available at `http://localhost:8000/api/health`.

## Render a still

With the dependencies installed, render a topic frame at a specific song time:

```powershell
cd web ; npm run still -- perceptron 3
```

The renderer starts a temporary Vite server and writes a 1920×1080 PNG under `web/stills/`.

## Built during the event

- Vite + TypeScript and a vanilla 2D canvas timeline/player scaffold.
- A placeholder perceptron topic with sample lyrics, scenes, and an interactive pause point.
- A FastAPI endpoint for application-style practice quiz generation.

## Third-party

`pdoom-video` by mexicat is MIT-licensed and was used only as a design reference. Its attribution and license text are recorded in [THIRD_PARTY_LICENSES](./THIRD_PARTY_LICENSES). No code or assets from it are included.
