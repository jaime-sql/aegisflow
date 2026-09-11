#!/usr/bin/env python3
"""AegisFlow Stage 1 — Modal-ready agent worker stub.

Run locally (no Modal account required):
    python3 workers/modal_stub.py

Later (not wired in Stage 1):
    modal deploy workers/modal_stub.py

This process does not call OpenAI or DeepSeek. It prints the same
stable eventIds the Ops UI and Fabric stub share (see docs/event-schema.md).
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "aegisfire-01.json"


def main() -> None:
    incident = json.loads(FIXTURE.read_text())
    print("AegisFlow worker stub  host=local  runtime=modal-ready")
    print(f"incidentId={incident['incidentId']}  eventId={incident['eventId']}  schemaVersion={incident['schemaVersion']}")
    print("LLM router: openai (primary) / deepseek (backup) — unused in Stage 1")
    print("---")
    for agent in incident["agents"]:
        lineage = ", ".join(src["eventId"] for src in agent["lineage"])
        print(f"[{agent['agentId']}] {agent['eventId']}")
        print(f"  {agent['summary']}")
        print(f"  lineage: {lineage}")
        print()


if __name__ == "__main__":
    main()
