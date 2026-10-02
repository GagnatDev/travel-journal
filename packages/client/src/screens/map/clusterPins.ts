import { pinsRenderKey } from './pinRenderKey.js';
import type { MapRenderablePin } from './types.js';

export type PinCluster = {
  pins: MapRenderablePin[];
  lng: number;
  lat: number;
};

/** Screen-space distance under which two pins collapse into one cluster marker. */
export const CLUSTER_RADIUS_PX = 44;

export type ProjectFn = (lngLat: [number, number]) => { x: number; y: number };

/**
 * Groups pins whose projected screen positions overlap at the current zoom.
 * Greedy: each pin joins the nearest existing cluster within radius, anchored
 * at the cluster's first pin so grouping is stable across re-renders.
 */
export function clusterRenderablePins(
  pins: MapRenderablePin[],
  project: ProjectFn,
  radiusPx: number = CLUSTER_RADIUS_PX,
): PinCluster[] {
  type WorkingCluster = { pins: MapRenderablePin[]; anchor: { x: number; y: number } };
  const clusters: WorkingCluster[] = [];

  for (const pin of pins) {
    const point = project([pin.lng, pin.lat]);
    let nearest: WorkingCluster | undefined;
    let nearestDist = radiusPx;
    for (const cluster of clusters) {
      const dist = Math.hypot(cluster.anchor.x - point.x, cluster.anchor.y - point.y);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = cluster;
      }
    }
    if (nearest) {
      nearest.pins.push(pin);
    } else {
      clusters.push({ pins: [pin], anchor: point });
    }
  }

  return clusters.map(({ pins: members }) => ({
    pins: members,
    lng: members.reduce((sum, p) => sum + p.lng, 0) / members.length,
    lat: members.reduce((sum, p) => sum + p.lat, 0) / members.length,
  }));
}

/** Identity of a rendered marker set — pin data plus how pins are grouped. */
export function clustersRenderKey(clusters: PinCluster[]): string {
  return clusters.map((c) => pinsRenderKey(c.pins)).join('||');
}
