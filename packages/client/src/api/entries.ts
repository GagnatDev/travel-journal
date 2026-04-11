import type { CreateEntryRequest, Entry, UpdateEntryRequest } from '@travel-journal/shared';

import { apiJson } from './client.js';

export interface EntriesPage {
  entries: Entry[];
  total: number;
}

export function fetchEntriesPage(tripId: string, page: number, token: string): Promise<EntriesPage> {
  return apiJson<EntriesPage>(`/api/v1/trips/${tripId}/entries?page=${page}&limit=20`, { token });
}

export function deleteEntry(tripId: string, entryId: string, token: string): Promise<void> {
  return apiJson<void>(`/api/v1/trips/${tripId}/entries/${entryId}`, { method: 'DELETE', token });
}

export function fetchEntry(tripId: string, entryId: string, token: string): Promise<Entry> {
  return apiJson<Entry>(`/api/v1/trips/${tripId}/entries/${entryId}`, { token });
}

export function createEntry(tripId: string, data: CreateEntryRequest, token: string): Promise<Entry> {
  return apiJson<Entry>(`/api/v1/trips/${tripId}/entries`, {
    method: 'POST',
    token,
    body: data,
  });
}

export function updateEntry(
  tripId: string,
  entryId: string,
  data: UpdateEntryRequest,
  token: string,
): Promise<Entry> {
  return apiJson<Entry>(`/api/v1/trips/${tripId}/entries/${entryId}`, {
    method: 'PATCH',
    token,
    body: data,
  });
}
