#!/usr/bin/env python3
"""AegisFlow Stage 2 — Modal agent worker.

Local (no Modal account, no LLM keys):
    python3 workers/modal_stub.py

Prints the same stable agent eventIds Ops uses
(`evt_aegisfire01_agent_*` / `evt_svwui_agent_*`).

Deploy (Jaime):
    modal secret create aegisflow-llm OPENAI_API_KEY=... DEEPSEEK_API_KEY=...
    modal deploy workers/modal_stub.py

Then set MODAL_ENDPOINT to the printed `run_agent` URL plus
MODAL_TOKEN_ID / MODAL_TOKEN_SECRET (proxy auth). Ops POSTs JSON and
keeps the request eventId/lineage — this worker only fills summary,
confidence, and recommendations.

OpenAI is primary; DeepSeek is the cheaper backup. Missing keys return
fixture JSON so the local CLI still works.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "aegisfire-01.json"

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o-mini"
DEEPSEEK_MODEL = "deepseek-chat"


def _deepseek_url() -> str:
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    return f"{base}/chat/completions"


def _chat(url: str, api_key: str, model: str, system: str, user: str) -> str:
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        body = json.loads(res.read().decode("utf-8"))
    text = (
        (body.get("choices") or [{}])[0]
        .get("message", {})
        .get("content")
    )
    if not text:
        raise RuntimeError("LLM returned empty content")
    return text


def _parse_agent_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[-1]
        if stripped.endswith("```"):
            stripped = stripped[: stripped.rfind("```")]
    data = json.loads(stripped)
    if not isinstance(data, dict) or not data.get("summary") or not data.get("recommendations"):
        raise RuntimeError("LLM JSON missing summary/recommendations")
    return data


def complete_with_failover(system: str, user: str) -> tuple[str, dict[str, Any]]:
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    errors: list[str] = []
    if openai_key:
        try:
            parsed = _parse_agent_json(
                _chat(OPENAI_URL, openai_key, OPENAI_MODEL, system, user)
            )
            return "openai", parsed
        except Exception as exc:  # noqa: BLE001 — failover
            errors.append(f"openai: {exc}")
    if deepseek_key:
        try:
            parsed = _parse_agent_json(
                _chat(_deepseek_url(), deepseek_key, DEEPSEEK_MODEL, system, user)
            )
            return "deepseek", parsed
        except Exception as exc:  # noqa: BLE001 — failover
            errors.append(f"deepseek: {exc}")
    raise RuntimeError("; ".join(errors) or "no LLM keys")


def handle_run_agent(item: dict[str, Any]) -> dict[str, Any]:
    """Fill agent content. Never mint a new eventId — echo the request."""
    prompt = item.get("prompt") or {}
    system = prompt.get("system") or "Return JSON with summary, confidence, recommendations."
    user = prompt.get("user") or json.dumps(
        {"agentId": item.get("agentId"), "hotspots": item.get("hotspots"), "wind": item.get("wind")}
    )
    used, body = complete_with_failover(system, user)
    return {
        "eventId": item.get("eventId"),
        "agentId": item.get("agentId"),
        "incidentId": item.get("incidentId"),
        "summary": body["summary"],
        "confidence": body.get("confidence", 0.6),
        "recommendations": body["recommendations"],
        "lineage": item.get("lineage") or [],
        "used": used,
        "model": {"primary": "openai", "backup": "deepseek", "used": used, "runtime": "modal"},
    }


def _print_fixture() -> None:
    incident = json.loads(FIXTURE.read_text())
    print("AegisFlow worker  host=local  runtime=modal-ready")
    print(
        f"incidentId={incident['incidentId']}  eventId={incident['eventId']}  "
        f"schemaVersion={incident['schemaVersion']}"
    )
    print("LLM router: openai (primary) / deepseek (backup)")
    print("Deploy: modal deploy workers/modal_stub.py")
    print("---")
    for agent in incident["agents"]:
        lineage = ", ".join(src["eventId"] for src in agent["lineage"])
        print(f"[{agent['agentId']}] {agent['eventId']}")
        print(f"  {agent['summary']}")
        print(f"  lineage: {lineage}")
        print()


try:
    import modal

    image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi")
    app = modal.App("aegisflow-agents")

    @app.function(
        image=image,
        timeout=60,
        secrets=[modal.Secret.from_name("aegisflow-llm")],
    )
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def run_agent(item: dict) -> dict:
        return handle_run_agent(item)

except ImportError:
    app = None
    run_agent = None  # type: ignore[assignment]


def main() -> None:
    _print_fixture()


if __name__ == "__main__":
    main()
