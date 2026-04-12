import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Comment } from '@travel-journal/shared';

import { useAuth } from '../context/AuthContext.js';
import { addComment, deleteComment, fetchComments } from '../api/comments.js';

interface CommentSectionProps {
  tripId: string;
  entryId: string;
}

export function CommentSection({ tripId, entryId }: CommentSectionProps) {
  const { t, i18n } = useTranslation();
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ['comments', entryId],
    queryFn: () => fetchComments(tripId, entryId, accessToken!),
    enabled: isOpen && !!accessToken,
  });

  const addMutation = useMutation({
    mutationFn: (content: string) => addComment(tripId, entryId, content, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['comments', entryId] });
      setText('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(tripId, entryId, commentId, accessToken!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['comments', entryId] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    addMutation.mutate(trimmed);
  }

  const totalComments = isOpen ? comments.length : 0;

  return (
    <div className="pt-2 border-t border-caption/10 mt-2">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="font-ui text-xs text-caption hover:text-accent transition-colors"
        aria-expanded={isOpen}
      >
        {isOpen
          ? t('comments.hide')
          : t('comments.count', { count: totalComments })}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {isLoading && (
            <p className="font-ui text-xs text-caption">{t('common.loading')}</p>
          )}

          {!isLoading && comments.length === 0 && (
            <p className="font-ui text-xs text-caption">{t('comments.empty')}</p>
          )}

          <ul className="space-y-2">
            {comments.map((comment) => {
              const formattedDate = new Date(comment.createdAt).toLocaleDateString(
                i18n.language,
                { month: 'short', day: 'numeric' },
              );
              const isAuthor = comment.authorId === user?.id;

              return (
                <li key={comment.id} className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <span className="font-ui text-xs font-medium text-heading">
                      {comment.authorName}
                    </span>
                    <span className="font-ui text-xs text-caption ml-1">{formattedDate}</span>
                    <p className="font-body text-sm text-body break-words">{comment.content}</p>
                  </div>
                  {isAuthor && (
                    <button
                      onClick={() => deleteMutation.mutate(comment.id)}
                      disabled={deleteMutation.isPending}
                      className="font-ui text-xs text-red-500 hover:underline shrink-0"
                      aria-label={t('comments.delete')}
                    >
                      {t('comments.delete')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('comments.placeholder')}
              maxLength={1000}
              className="flex-1 font-body text-sm border border-caption/20 rounded px-2 py-1 bg-bg-secondary text-body placeholder:text-caption/60 focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!text.trim() || addMutation.isPending}
              className="font-ui text-xs bg-accent text-white px-3 py-1 rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {t('comments.add')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
