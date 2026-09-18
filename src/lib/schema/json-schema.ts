import { SCHEMA_VERSION } from "./zod";

/** JSON Schema (draft-07) for IncidentEvent — shared with future Fabric twin. */
export const incidentJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://aegisflow.local/schema/incident-event.json",
  title: "AegisFlow IncidentEvent",
  type: "object",
  required: [
    "eventId",
    "schemaVersion",
    "incidentId",
    "name",
    "status",
    "region",
    "startedAt",
    "updatedAt",
    "executiveSummary",
    "hotspots",
    "wind",
    "agents",
    "feedHealth",
    "timeline",
    "resources",
  ],
  properties: {
    eventId: {
      type: "string",
      pattern: "^evt_[a-z0-9_]+$",
      description: "Stable incident envelope ID shared by Ops and Fabric.",
    },
    schemaVersion: { const: SCHEMA_VERSION },
    incidentId: { type: "string", examples: ["AegisFire-01"] },
    name: { type: "string" },
    status: { enum: ["active", "contained", "patrol"] },
    region: {
      type: "object",
      required: ["id", "name", "placeholder", "center", "bbox"],
      properties: {
        id: {
          enum: ["el-salvador", "cascade"],
          description:
            "Ops region picker. Default is el-salvador; cascade is AegisFire-01.",
        },
        name: { type: "string" },
        placeholder: {
          type: "boolean",
          description: "True for the Cascade AegisFire-01 demo incident.",
        },
        center: {
          type: "object",
          required: ["lat", "lon"],
          properties: {
            lat: { type: "number" },
            lon: { type: "number" },
          },
        },
        bbox: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: { type: "number" },
        },
      },
    },
    startedAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    executiveSummary: { type: "string" },
    hotspots: { type: "array", items: { $ref: "#/definitions/Hotspot" } },
    wind: { type: "array", items: { $ref: "#/definitions/WindTick" } },
    agents: { type: "array", items: { $ref: "#/definitions/AgentOutput" } },
    feedHealth: { $ref: "#/definitions/FeedHealth" },
    timeline: { type: "array", items: { $ref: "#/definitions/TimelineItem" } },
    resources: { type: "array", items: { $ref: "#/definitions/ResourceBar" } },
  },
  definitions: {
    Hotspot: {
      type: "object",
      required: [
        "eventId",
        "schemaVersion",
        "lat",
        "lon",
        "brightnessK",
        "confidence",
        "observedAt",
        "source",
      ],
    },
    WindTick: {
      type: "object",
      required: [
        "eventId",
        "schemaVersion",
        "lat",
        "lon",
        "speedMps",
        "directionDeg",
        "observedAt",
        "source",
      ],
    },
    AgentOutput: {
      type: "object",
      required: [
        "eventId",
        "schemaVersion",
        "agentId",
        "incidentId",
        "title",
        "summary",
        "recommendations",
        "lineage",
        "model",
        "producedAt",
      ],
      properties: {
        lineage: {
          type: "array",
          minItems: 1,
          description: "Source eventIds that grounded this recommendation.",
        },
        degraded: {
          type: "boolean",
          description:
            "True when a live Modal/LLM attempt failed and fixture text was substituted. Omit on healthy fixture (no keys) and live success.",
        },
      },
    },
    FeedHealth: {
      type: "object",
      required: ["eventId", "schemaVersion", "overall", "feeds", "producedAt"],
    },
    TimelineItem: {
      type: "object",
      required: ["eventId", "schemaVersion", "at", "kind", "label"],
    },
    ResourceBar: {
      type: "object",
      required: ["id", "label", "allocated", "available", "unit"],
    },
  },
} as const;
