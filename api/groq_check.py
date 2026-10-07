import os, sys
from pathlib import Path
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
key = os.getenv("GROQ_API_KEY", "").strip()
print("key loaded:", bool(key))
if not key:
    sys.exit("GROQ_API_KEY missing: .env not found or the line is wrong")

H = {"Authorization": f"Bearer {key}"}
r = httpx.get("https://api.groq.com/openai/v1/models", headers=H, timeout=20)
print("models:", r.status_code)
ids = sorted(m["id"] for m in r.json().get("data", [])) if r.status_code == 200 else []
print("\n".join(ids) or r.text[:300])

model = sys.argv[1] if len(sys.argv) > 1 else "llama-3.3-70b-versatile"
body = {
    "model": model,
    "messages": [{"role": "user", "content": 'Reply with JSON only: {"ok": true}'}],
    "response_format": {"type": "json_object"},
    "max_tokens": 200,
}
r = httpx.post("https://api.groq.com/openai/v1/chat/completions", headers=H, json=body, timeout=30)
print("\nchat:", model, r.status_code)
print(r.text[:600])