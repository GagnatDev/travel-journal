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
  const [optimistic, setOptimistic] = useState<Reaction[] | null>(null);
  /** Last successful mutation result until props catch up (e.g. isolated tests). */
  const [serverMirror, setServerMirror] = useState<Reaction[] | null>(null);

  useEffect(() => {
    setServerMirror(null);
  }, [reactions]);

  const displayed = optimistic ?? serverMirror ?? reactions;

  const mutation = useMutation({
    mutationFn: (emoji: ReactionEmoji) =>
      toggleReaction(tripId, entryId, emoji, accessToken!),
    onMutate: async (emoji) => {
      const userId = user?.id ?? '';
      const base = optimistic ?? serverMirror ?? reactions;
      const hasReacted = base.some((r) => r.emoji === emoji && r.userId === userId);
      const next = hasReacted
        ? base.filter((r) => !(r.emoji === emoji && r.userId === userId))
        : [...base, { emoji, userId, createdAt: new Date().toISOString() }];
      setOptimistic(next);
    },
    onSuccess: (data) => {
      setOptimistic(null);
      setServerMirror(data.reactions);
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
    onError: () => {
      setOptimistic(null);
    },
  });

  const currentUserId = user?.id;

  function countForEmoji(emoji: ReactionEmoji): number {
    return displayed.filter((r) => r.emoji === emoji).length;
  }

  function hasReacted(emoji: ReactionEmoji): boolean {
    return displayed.some((r) => r.emoji === emoji && r.userId === currentUserId);
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
