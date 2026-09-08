# AegisFlow

**IEEE Response Quest Challenge — submission #5395**  
Real-time multi-agent data fusion for wildfire situational awareness.

> **Status:** Architecture / planning. Implementation starts only after Jaime approves the Notion architecture.

## Docs (Notion)

- [Project hub row](https://app.notion.com/p/3d5825c9c7b7816aa059d4795175d7fb)
- [Architecture](https://app.notion.com/p/3d5825c9c7b78104a395c1b4bb1fb960)
- [First steps & build plan](https://app.notion.com/p/3d5825c9c7b7813d90a7fa489e2e2352)
- [Credits & capability map](https://app.notion.com/p/3d5825c9c7b78129b95ce8133bf0c897)

## Layers (summary)

1. **Ingestion** — NASA FIRMS, IoT wind/weather, drone IR, cams, crowdsourced (PII scrubbed)
2. **Multi-agent reasoning** — Fire propagation · Evacuation logistics · Resource allocation (+ RAG + lineage)
3. **Command UI** — Single-pane Ops dashboard (map, exec summary, dispatch)

## Repo policy

No app code in this repo until architecture is approved. Secrets never committed.
