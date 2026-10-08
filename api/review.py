from pydantic import BaseModel
if __package__:
    from .llm import ModelCallError, call_model

else:
    from llm import ModelCallError, call_model


class LineFix(BaseModel):
    index: int
    problem: str
    fixed_text: str

class Review(BaseModel):
    verdict: str            # "ok" or "fix"
    fixes: list[LineFix] = []

REVIEW_SYSTEM = """You check song lyrics against a fact sheet. Output ONE JSON object, no markdown:
{"verdict": "ok" or "fix", "fixes": [{"index": int, "problem": str, "fixed_text": str}]}
Flag a line if it states anything not in FACTS, contradicts FACTS, mixes up step and sigmoid, contains a digit or symbol, or says a number differently from FACTS. fixed_text keeps the syllable count within 2 and the same end rhyme. Do not touch lines that are fine. If every line passes, verdict is "ok" and fixes is empty. index counts lines from 0."""

async def review_lyrics(lines: list[str], facts_json: str):
    numbered = "\n".join(f"{i}: {t}" for i, t in enumerate(lines))
    messages = [
        {"role": "system", "content": REVIEW_SYSTEM},
        {"role": "user", "content": f"FACTS: {facts_json}\nLINES:\n{numbered}\nReturn JSON only."},
    ]
    review, model = await call_model(messages, Review, temperature=0.1, max_tokens=2000)
    return review, model

def apply_fixes(lines: list[str], review: Review) -> list[str]:
    out = list(lines)
    for fix in review.fixes:
        if 0 <= fix.index < len(out) and fix.fixed_text.strip():
            out[fix.index] = fix.fixed_text.strip()
    return out