import { z } from "zod";

/** Shared Ops ↔ Fabric schema version. Bump only with a documented migration. */
export const SCHEMA_VERSION = "1.0.0";

export const EventIdSchema = z
  .string()
  .min(8)
  .regex(/^evt_[a-z0-9_]+$/, "eventId must look like evt_aegisfire01_hotspot_01");

export const IsoDateTimeSchema = z.string().datetime();

export const GeoPointSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
});

export const BBoxSchema = z.tuple([
  z.number(), // west
  z.number(), // south
  z.number(), // east
  z.number(), // north
]);

export const LineageSourceSchema = z.object({
  eventId: EventIdSchema,
  kind: z.enum(["hotspot", "wind", "crowd", "sop", "feed", "sim"]),
  label: z.string(),
});

export const HotspotSchema = z.object({
  eventId: EventIdSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  lat: z.number(),
  lon: z.number(),
  brightnessK: z.number(),
  confidence: z.enum(["low", "nominal", "high"]),
  frpMw: z.number().optional(),
  observedAt: IsoDateTimeSchema,
  satellite: z.string().optional(),
  source: z.enum(["NASA_FIRMS", "NASA_FIRMS_FIXTURE"]),
  degraded: z.boolean().optional(),
});

export const WindTickSchema = z.object({
  eventId: EventIdSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  lat: z.number(),
  lon: z.number(),
  speedMps: z.number().nonnegative(),
  directionDeg: z.number().gte(0).lt(360),
  gustMps: z.number().nonnegative().optional(),
  observedAt: IsoDateTimeSchema,
  source: z.enum(["MOCK_WIND", "IOT_WIND"]),
  degraded: z.boolean().optional(),
});

export const DispatchActionSchema = z.object({
  actionId: z.string(),
  label: z.string(),
  detail: z.string(),
  priority: z.enum(["P1", "P2", "P3"]),
  resourceHint: z.string().optional(),
});

export const AgentIdSchema = z.enum([
  "fire-propagation",
  "evacuation",
  "resource-allocation",
]);

export const AgentOutputSchema = z.object({
  eventId: EventIdSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  agentId: AgentIdSchema,
  incidentId: z.string(),
  title: z.string(),
  summary: z.string(),
  recommendations: z.array(DispatchActionSchema),
  lineage: z.array(LineageSourceSchema).min(1),
  model: z.object({
    primary: z.literal("openai"),
    backup: z.literal("deepseek"),
    used: z.enum(["openai", "deepseek", "fixture"]),
    runtime: z.enum(["local", "modal"]),
  }),
  producedAt: IsoDateTimeSchema,
});

export const FeedStatusSchema = z.enum(["ok", "degraded", "down"]);

export const FeedComponentSchema = z.object({
  id: z.enum(["firms", "wind", "agents", "crowd", "rf_sim"]),
  label: z.string(),
  status: FeedStatusSchema,
  detail: z.string(),
  lastSuccessAt: IsoDateTimeSchema.nullable(),
});

export const FeedHealthSchema = z.object({
  eventId: EventIdSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  overall: FeedStatusSchema,
  feeds: z.array(FeedComponentSchema),
  producedAt: IsoDateTimeSchema,
});

export const TimelineItemSchema = z.object({
  eventId: EventIdSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  at: IsoDateTimeSchema,
  kind: z.enum([
    "ingest",
    "agent",
    "dispatch",
    "crowd",
    "sim",
    "system",
  ]),
  label: z.string(),
  detail: z.string().optional(),
  sourceEventId: EventIdSchema.optional(),
});

export const ResourceBarSchema = z.object({
  id: z.string(),
  label: z.string(),
  allocated: z.number().nonnegative(),
  available: z.number().nonnegative(),
  unit: z.string(),
});

export const IncidentEventSchema = z.object({
  eventId: EventIdSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
  incidentId: z.string(),
  name: z.string(),
  status: z.enum(["active", "contained", "patrol"]),
  region: z.object({
    name: z.string(),
    placeholder: z.boolean(),
    center: GeoPointSchema,
    bbox: BBoxSchema,
  }),
  startedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  executiveSummary: z.string(),
  hotspots: z.array(HotspotSchema),
  wind: z.array(WindTickSchema),
  agents: z.array(AgentOutputSchema),
  feedHealth: FeedHealthSchema,
  timeline: z.array(TimelineItemSchema),
  resources: z.array(ResourceBarSchema),
});

export type EventId = z.infer<typeof EventIdSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type WindTick = z.infer<typeof WindTickSchema>;
export type LineageSource = z.infer<typeof LineageSourceSchema>;
export type DispatchAction = z.infer<typeof DispatchActionSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type FeedHealth = z.infer<typeof FeedHealthSchema>;
export type FeedComponent = z.infer<typeof FeedComponentSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type ResourceBar = z.infer<typeof ResourceBarSchema>;
export type IncidentEvent = z.infer<typeof IncidentEventSchema>;

export function parseIncidentEvent(data: unknown): IncidentEvent {
  return IncidentEventSchema.parse(data);
}

export function collectEventIds(incident: IncidentEvent): string[] {
  const ids = [
    incident.eventId,
    incident.feedHealth.eventId,
    ...incident.hotspots.map((h) => h.eventId),
    ...incident.wind.map((w) => w.eventId),
    ...incident.agents.map((a) => a.eventId),
    ...incident.agents.flatMap((a) => a.lineage.map((l) => l.eventId)),
    ...incident.timeline.map((t) => t.eventId),
    ...incident.timeline
      .map((t) => t.sourceEventId)
      .filter((id): id is string => Boolean(id)),
  ];
  return ids;
}
