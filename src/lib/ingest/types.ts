export type BBox = [number, number, number, number];

export type GeoPoint = { lat: number; lon: number };

export type IngestRegion = {
  bbox: BBox;
  center: GeoPoint;
};

export type IngestFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type IngestEnv = Record<string, string | undefined>;
