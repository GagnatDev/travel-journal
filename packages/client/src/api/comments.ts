import type { Comment } from '@travel-journal/shared';

import { apiJson } from './client.js';

export function fetchComments(
  tripId: string,
  entryId: string,
  token: string,
): Promise<Comment[]> {
  return apiJson<Comment[]>(
    `/api/v1/trips/${tripId}/entries/${entryId}/comments`,
    { token },
  );
}

export function addComment(
  tripId: string,
  entryId: string,
  content: string,
  token: string,
): Promise<Comment> {
  return apiJson<Comment>(
    `/api/v1/trips/${tripId}/entries/${entryId}/comments`,
    { method: 'POST', token, body: { content } },
  );
}

export function deleteComment(
  tripId: string,
  entryId: string,
  commentId: string,
  token: string,
): Promise<void> {
  return apiJson<void>(
    `/api/v1/trips/${tripId}/entries/${entryId}/comments/${commentId}`,
    { method: 'DELETE', token },
  );
}
