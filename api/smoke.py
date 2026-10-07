import json
import httpx

BASE = "http://127.0.0.1:8001"

def show(label, response):
    print(f"\n=== {label}: HTTP {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=2)[:6000])
    except Exception:
        print(response.text[:2000])

with httpx.Client(timeout=120) as client:
    show("health", client.get(f"{BASE}/api/health"))
    show("quiz", client.post(f"{BASE}/api/quiz", json={"topic_id": "perceptron"}))
    show("song", client.post(f"{BASE}/api/song?fresh=1", json={"topic_id": "perceptron"}))