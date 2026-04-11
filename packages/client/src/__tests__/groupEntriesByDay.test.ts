import { describe, it, expect } from 'vitest';
import type { Entry } from '@travel-journal/shared';
import { groupEntriesByDay } from '../utils/groupEntriesByDay.js';

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    tripId: 'trip-1',
    authorId: 'user-1',
    authorName: 'Test User',
    title: 'Test Entry',
    content: 'Some content',
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('groupEntriesByDay', () => {
  it('returns an empty array for no entries', () => {
    expect(groupEntriesByDay([], undefined)).toEqual([]);
  });

  it('groups entries from the same day into one group', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
      makeEntry({ id: 'e2', createdAt: '2024-06-10T14:00:00.000Z' }),
    ];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });

  it('groups entries from different days into separate groups', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
      makeEntry({ id: 'e2', createdAt: '2024-06-11T08:00:00.000Z' }),
      makeEntry({ id: 'e3', createdAt: '2024-06-12T08:00:00.000Z' }),
    ];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups).toHaveLength(3);
  });

  it('orders groups newest-first', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
      makeEntry({ id: 'e2', createdAt: '2024-06-12T08:00:00.000Z' }),
      makeEntry({ id: 'e3', createdAt: '2024-06-11T08:00:00.000Z' }),
    ];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups[0].entries[0].id).toBe('e2');
    expect(groups[1].entries[0].id).toBe('e3');
    expect(groups[2].entries[0].id).toBe('e1');
  });

  it('orders entries within a group newest-first', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
      makeEntry({ id: 'e2', createdAt: '2024-06-10T18:00:00.000Z' }),
    ];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups[0].entries[0].id).toBe('e2');
    expect(groups[0].entries[1].id).toBe('e1');
  });

  it('calculates dayNumber from departure date', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
      makeEntry({ id: 'e2', createdAt: '2024-06-12T08:00:00.000Z' }),
    ];
    const groups = groupEntriesByDay(entries, '2024-06-10');
    // Newest group first: June 12 is day 3 (offset 2 + 1), June 10 is day 1
    expect(groups[0].dayNumber).toBe(3); // June 12
    expect(groups[1].dayNumber).toBe(1); // June 10
  });

  it('sets dayNumber to null when no departure date', () => {
    const entries = [makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' })];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups[0].dayNumber).toBeNull();
  });

  it('extracts locationSummary from first entry with a named location', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
      makeEntry({
        id: 'e2',
        createdAt: '2024-06-10T10:00:00.000Z',
        location: { lat: 59.9, lng: 10.7, name: 'Oslo' },
      }),
    ];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups[0].locationSummary).toBe('Oslo');
  });

  it('sets locationSummary to undefined when no entries have a named location', () => {
    const entries = [
      makeEntry({ id: 'e1', createdAt: '2024-06-10T08:00:00.000Z' }),
    ];
    const groups = groupEntriesByDay(entries, undefined);
    expect(groups[0].locationSummary).toBeUndefined();
  });
});
