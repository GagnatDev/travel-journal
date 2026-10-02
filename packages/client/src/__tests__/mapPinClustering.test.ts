import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { MapPin } from '@travel-journal/shared';

import {
  CLUSTER_RADIUS_PX,
  clusterRenderablePins,
  clustersRenderKey,
  type ProjectFn,
} from '../screens/map/clusterPins.js';
import { buildClusterPopupHtml } from '../screens/map/pinPopupHtml.js';

const fakeT = ((key: string) => key) as TFunction;

function entryPin(id: string, lat: number, lng: number): MapPin {
  return {
    kind: 'entry',
    entryId: id,
    title: `Entry ${id}`,
    lat,
    lng,
    createdAt: '2026-07-01T10:00:00.000Z',
  };
}

function savedPin(id: string, lat: number, lng: number, isFavorite = false): MapPin {
  return {
    kind: 'savedLocation',
    id,
    lat,
    lng,
    createdAt: '2026-07-01T09:00:00.000Z',
    savedByUserId: 'user-1',
    savedByDisplayName: 'Test User',
    isFavorite,
  };
}

/** Projection where 1 degree = `scale` pixels (zoom stand-in). */
function projectAtScale(scale: number): ProjectFn {
  return ([lng, lat]) => ({ x: lng * scale, y: lat * scale });
}

describe('clusterRenderablePins', () => {
  it('groups pins that overlap on screen and keeps distant pins separate', () => {
    const pins = [
      entryPin('a', 48.8566, 2.3522),
      entryPin('b', 48.8606, 2.3376), // ~0.015° from a
      savedPin('c', 41.9028, 12.4964), // Rome — far away
    ];

    const clusters = clusterRenderablePins(pins, projectAtScale(10));

    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.pins.map((p) => ('entryId' in p ? p.entryId : ''))).toEqual(['a', 'b']);
    expect(clusters[1]!.pins).toHaveLength(1);
  });

  it('splits a group apart when zooming in spreads the pins beyond the radius', () => {
    const pins = [entryPin('a', 48.8566, 2.3522), entryPin('b', 48.8606, 2.3376)];

    const zoomedOut = clusterRenderablePins(pins, projectAtScale(10));
    const zoomedIn = clusterRenderablePins(pins, projectAtScale(100_000));

    expect(zoomedOut).toHaveLength(1);
    expect(zoomedIn).toHaveLength(2);
  });

  it('places a cluster marker at the centroid of its members', () => {
    const pins = [entryPin('a', 10, 20), entryPin('b', 12, 22)];
    const project: ProjectFn = () => ({ x: 0, y: 0 });

    const clusters = clusterRenderablePins(pins, project);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.lat).toBeCloseTo(11);
    expect(clusters[0]!.lng).toBeCloseTo(21);
  });

  it('honours the pixel radius boundary', () => {
    const pins = [entryPin('a', 0, 0), entryPin('b', 0, 1)];
    const justInside: ProjectFn = ([lng]) => ({ x: lng * CLUSTER_RADIUS_PX, y: 0 });
    const justOutside: ProjectFn = ([lng]) => ({ x: lng * (CLUSTER_RADIUS_PX + 1), y: 0 });

    expect(clusterRenderablePins(pins, justInside)).toHaveLength(1);
    expect(clusterRenderablePins(pins, justOutside)).toHaveLength(2);
  });
});

describe('clustersRenderKey', () => {
  it('changes when grouping changes even if the pins do not', () => {
    const pins = [entryPin('a', 48.8566, 2.3522), entryPin('b', 48.8606, 2.3376)];

    const grouped = clustersRenderKey(clusterRenderablePins(pins, projectAtScale(10)));
    const split = clustersRenderKey(clusterRenderablePins(pins, projectAtScale(100_000)));

    expect(grouped).not.toBe(split);
  });
});

describe('buildClusterPopupHtml', () => {
  it('renders one item per pin with only the first visible, plus nav controls', () => {
    const pins = [entryPin('a', 1, 1), savedPin('b', 1, 1, true), savedPin('c', 1, 1)];
    const html = buildClusterPopupHtml(pins, 'trip-1', fakeT, true);

    const host = document.createElement('div');
    host.innerHTML = html;

    const items = host.querySelectorAll('[data-cluster-item]');
    expect(items).toHaveLength(3);
    expect(items[0]!.hasAttribute('hidden')).toBe(false);
    expect(items[1]!.hasAttribute('hidden')).toBe(true);
    expect(items[2]!.hasAttribute('hidden')).toBe(true);

    expect(host.querySelector('[data-cluster-nav="prev"]')).not.toBeNull();
    expect(host.querySelector('[data-cluster-nav="next"]')).not.toBeNull();
    expect(host.querySelector('[data-cluster-counter]')!.textContent).toBe('1 / 3');

    // Each pin keeps its regular popup content and actions.
    expect(items[0]!.querySelector('[data-popup-entry-id="a"]')).not.toBeNull();
    expect(items[1]!.querySelector('[data-compose-from-saved="b"]')).not.toBeNull();
    expect(items[2]!.querySelector('[data-delete-saved="c"]')).not.toBeNull();
  });
});
