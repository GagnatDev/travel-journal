import type { Entry } from '@travel-journal/shared';

import { logger } from '../logger.js';

const MAPBOX_STYLE_PATH = 'mapbox/outdoors-v12';
const TILE_SIZE = 512;
const FIT_PADDING_PX = 60;
const MAX_ZOOM = 12;
const MIN_POINT_SPAN_DEG = 0.008;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Same env key as photobook image DPR so map raster matches photo sharpness. */
function photobookMapFetchDpr(): number {
  const raw = process.env['TRIP_PDF_IMAGE_DPR'];
  if (raw === undefined || raw === '') return 5;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 5;
  return Math.min(6, Math.max(1, n));
}

export function getPhotobookPdfMapboxToken(): string | undefined {
  const a = process.env['TRIP_PDF_MAPBOX_TOKEN']?.trim();
  if (a) return a;
  const b = process.env['MAPBOX_ACCESS_TOKEN']?.trim();
  if (b) return b;
  return undefined;
}

export function collectPhotobookEntryLocations(entries: readonly Entry[]): LatLng[] {
  const out: LatLng[] = [];
  for (const e of entries) {
    const loc = e.location;
    if (!loc) continue;
    const { lat, lng } = loc;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -85.0511 || lat > 85.0511) continue;
    if (lng < -180 || lng > 180) continue;
    out.push({ lat, lng });
  }
  return out;
}

function latRad(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return Math.log((1 + s) / (1 - s)) / 2;
}

/**
 * Zoom level that fits `bbox` into width×height (Web Mercator), matching Mapbox Static bbox behaviour roughly.
 */
export function zoomLevelFromBounds(bbox: BBox, widthPx: number, heightPx: number): number {
  const ZOOM_MAX = 22;
  const latSpan = Math.max(1e-12, latRad(bbox.north) - latRad(bbox.south));
  const latFraction = latSpan / Math.PI;
  let lngDiff = bbox.east - bbox.west;
  if (lngDiff < 0) lngDiff += 360;
  const lngFraction = Math.max(1e-12, lngDiff / 360);
  const latZoom = Math.log(heightPx / TILE_SIZE / latFraction) / Math.LN2;
  const lngZoom = Math.log(widthPx / TILE_SIZE / lngFraction) / Math.LN2;
  return Math.min(ZOOM_MAX, latZoom, lngZoom);
}

function clampLat(lat: number): number {
  return Math.min(85.0511, Math.max(-85.0511, lat));
}

export function tightBoundingBoxFromPoints(points: readonly LatLng[]): BBox {
  if (points.length === 0) {
    return { west: 0, south: 0, east: 0, north: 0 };
  }
  let west = points[0]!.lng;
  let east = points[0]!.lng;
  let south = points[0]!.lat;
  let north = points[0]!.lat;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const latPad = Math.max(MIN_POINT_SPAN_DEG / 2, (north - south) * 0.02 || MIN_POINT_SPAN_DEG / 2);
  const lngPad = Math.max(MIN_POINT_SPAN_DEG / 2, (east - west) * 0.02 || MIN_POINT_SPAN_DEG / 2);
  return {
    west: west - lngPad,
    east: east + lngPad,
    south: clampLat(south - latPad),
    north: clampLat(north + latPad),
  };
}

/** Widen bbox (center-fixed) until a bbox fit would use at most `maxZoom` (mirrors app `fitBounds` maxZoom cap). */
export function expandBoundsToMaxZoom(bbox: BBox, widthPx: number, heightPx: number, maxZoom: number): BBox {
  let b = { ...bbox };
  for (let i = 0; i < 150; i++) {
    const z = zoomLevelFromBounds(b, widthPx, heightPx);
    if (z <= maxZoom) break;
    const centerLat = (b.north + b.south) / 2;
    const centerLng = (b.east + b.west) / 2;
    const latSpan = Math.max(1e-8, b.north - b.south);
    const lngSpan = Math.max(1e-8, b.east - b.west);
    const excess = z - maxZoom;
    const factor = 1 + 0.22 * Math.min(12, Math.max(0.5, excess));
    const halfLat = (latSpan * factor) / 2;
    let halfLng = (lngSpan * factor) / 2;
    b = {
      south: clampLat(centerLat - halfLat),
      north: clampLat(centerLat + halfLat),
      west: centerLng - halfLng,
      east: centerLng + halfLng,
    };
    if (b.east - b.west > 350) {
      halfLng = 175;
      b = { ...b, west: centerLng - halfLng, east: centerLng + halfLng };
    }
  }
  return b;
}

export function buildMapboxStaticImageUrl(args: {
  accessToken: string;
  widthPx: number;
  heightPx: number;
  bbox: BBox;
  /** Mapbox `pin-s+RRGGBB(lng,lat)` markers, comma-separated (not URL-encoded). */
  markerOverlay: string;
  retina?: boolean;
}): string {
  const { accessToken, widthPx, heightPx, bbox, markerOverlay, retina = true } = args;
  const bboxPath = `[${bbox.west},${bbox.south},${bbox.east},${bbox.north}]`;
  const size = `${Math.round(widthPx)}x${Math.round(heightPx)}${retina ? '@2x' : ''}`;
  const qs = new URLSearchParams({
    padding: String(FIT_PADDING_PX),
    attribution: 'false',
    logo: 'false',
    access_token: accessToken,
  });
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_PATH}/static/${markerOverlay}/${bboxPath}/${size}?${qs.toString()}`;
}

export async function fetchPhotobookMapStaticPng(args: {
  points: readonly LatLng[];
  widthPx: number;
  heightPx: number;
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<Buffer | null> {
  const { points, widthPx, heightPx, accessToken } = args;
  const fetchFn = args.fetchFn ?? globalThis.fetch;
  if (points.length === 0) return null;

  let bbox = tightBoundingBoxFromPoints(points);
  bbox = expandBoundsToMaxZoom(bbox, widthPx, heightPx, MAX_ZOOM);

  const markerOverlay = points.map((p) => `pin-s+9b3f2b(${p.lng},${p.lat})`).join(',');
  const url = buildMapboxStaticImageUrl({
    accessToken,
    widthPx,
    heightPx,
    bbox,
    markerOverlay,
    retina: true,
  });

  try {
    const res = await fetchFn(url, { method: 'GET' });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Photobook PDF: Mapbox static map request failed');
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    logger.warn({ err }, 'Photobook PDF: Mapbox static map fetch failed');
    return null;
  }
}

/**
 * Pixel size for Mapbox request (API max 1280 per side). Uses DPR from `TRIP_PDF_IMAGE_DPR`.
 */
export function photobookMapStaticRequestPixels(layoutWPt: number, layoutHPt: number): { widthPx: number; heightPx: number } {
  const dpr = photobookMapFetchDpr();
  const widthPx = Math.min(1280, Math.max(1, Math.ceil(layoutWPt * dpr)));
  const heightPx = Math.min(1280, Math.max(1, Math.ceil(layoutHPt * dpr)));
  return { widthPx, heightPx };
}
