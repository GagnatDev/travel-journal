import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Reaction, ReactionEmoji } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';
import { toggleReaction } from '../api/reactions.js';

const EMOJIS: ReactionEmoji[] = ['❤️', '👍', '😂'];

interface ReactionBarProps {
  tripId: string;
  entryId: string;
  reactions: Reaction[];
}

export function ReactionBar({ tripId, entryId, reactions }: ReactionBarProps) {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [localReactions, setLocalReactions] = useState<Reaction[]>(reactions);

  // Sync with incoming prop changes (e.g., parent re-fetch)
  useEffect(() => {
    setLocalReactions(reactions);
  }, [reactions]);

  const mutation = useMutation({
    mutationFn: (emoji: ReactionEmoji) =>
      toggleReaction(tripId, entryId, emoji, accessToken!),
    onMutate: async (emoji) => {
      // Optimistic update
      const userId = user?.id ?? '';
      const hasReacted = localReactions.some(
        (r) => r.emoji === emoji && r.userId === userId,
      );
      const optimistic = hasReacted
        ? localReactions.filter((r) => !(r.emoji === emoji && r.userId === userId))
        : [...localReactions, { emoji, userId, createdAt: new Date().toISOString() }];
      setLocalReactions(optimistic);
      return { previous: localReactions };
    },
    onSuccess: (data) => {
      setLocalReactions(data.reactions);
      // Also update the entry in the infinite query cache
      queryClient.setQueriesData<{
        pages: Array<{ entries: Array<{ id: string; reactions: Reaction[] }> }>;
      }>(
        { queryKey: ['entries', tripId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              entries: page.entries.map((e) =>
                e.id === entryId ? { ...e, reactions: data.reactions } : e,
              ),
            })),
          };
        },
      );
    },
    onError: (_err, _emoji, context) => {
      // Rollback optimistic update
      if (context?.previous) {
        setLocalReactions(context.previous);
      }
    },
  });

  const currentUserId = user?.id;

  function countForEmoji(emoji: ReactionEmoji): number {
    return localReactions.filter((r) => r.emoji === emoji).length;
  }

  function hasReacted(emoji: ReactionEmoji): boolean {
    return localReactions.some((r) => r.emoji === emoji && r.userId === currentUserId);
  }

  return (
    <div className="flex gap-2 pt-2" aria-label={t('reactions.label')}>
      {EMOJIS.map((emoji) => {
        const count = countForEmoji(emoji);
        const active = hasReacted(emoji);
        return (
          <button
            key={emoji}
            onClick={() => mutation.mutate(emoji)}
            disabled={mutation.isPending || !accessToken}
            aria-label={`${emoji} ${count}`}
            aria-pressed={active}
            className={[
              'flex items-center gap-1 px-2 py-1 rounded-full text-sm font-ui border transition-colors',
              active
                ? 'bg-accent/10 border-accent text-accent'
                : 'bg-bg-secondary border-caption/20 text-caption hover:border-accent/50',
            ].join(' ')}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span className="text-xs">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
