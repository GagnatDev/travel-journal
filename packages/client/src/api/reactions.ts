import type { Reaction, ReactionEmoji } from '@travel-journal/shared';

import { apiJson } from './client.js';

export function toggleReaction(
  tripId: string,
  entryId: string,
  emoji: ReactionEmoji,
  token: string,
): Promise<{ reactions: Reaction[] }> {
  return apiJson<{ reactions: Reaction[] }>(
    `/api/v1/trips/${tripId}/entries/${entryId}/reactions`,
    { method: 'POST', token, body: { emoji } },
  );
}
