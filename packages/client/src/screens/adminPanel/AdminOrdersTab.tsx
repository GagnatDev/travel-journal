import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  PhotobookOrder,
  PhotobookOrderStatus,
  ProdigiQuote,
} from '@travel-journal/shared';

import {
  approvePhotobookOrder,
  fetchAdminPhotobookOrders,
  fetchPhotobookOrderQuote,
  rejectPhotobookOrder,
  retryPhotobookOrder,
} from '../../api/photobookOrders.js';
import { SettingsListRow } from '../../components/SettingsListRow.js';

interface AdminOrdersTabProps {
  token: string;
}

const STATUS_FILTERS: (PhotobookOrderStatus | 'all')[] = [
  'awaiting_approval',
  'requested',
  'submitting',
  'submitted',
  'failed',
  'rejected',
  'cancelled',
  'all',
];

export function AdminOrdersTab({ token }: AdminOrdersTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<PhotobookOrderStatus | 'all'>(
    'awaiting_approval',
  );
  const [quotes, setQuotes] = useState<Record<string, ProdigiQuote>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const { data: orders = [] } = useQuery<PhotobookOrder[]>({
    queryKey: ['admin-photobook-orders', statusFilter],
    queryFn: () => fetchAdminPhotobookOrders(token, statusFilter),
    enabled: !!token,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin-photobook-orders'] });

  const quoteMutation = useMutation({
    mutationFn: (orderId: string) => fetchPhotobookOrderQuote(orderId, token),
    onSuccess: (quote, orderId) => {
      setQuotes((prev) => ({ ...prev, [orderId]: quote }));
    },
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: string) => approvePhotobookOrder(orderId, token),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: (orderId: string) =>
      rejectPhotobookOrder(orderId, rejectReasons[orderId]?.trim() || undefined, token),
    onSuccess: invalidate,
  });

  const retryMutation = useMutation({
    mutationFn: (orderId: string) => retryPhotobookOrder(orderId, token),
    onSuccess: invalidate,
  });

  return (
    <section className="space-y-3">
      <h2 className="font-ui text-sm font-semibold text-caption uppercase tracking-wide">
        {t('admin.orders.title')}
      </h2>

      <div>
        <label
          htmlFor="orders-status-filter"
          className="block font-ui text-sm font-medium text-body mb-1"
        >
          {t('admin.orders.filterLabel')}
        </label>
        <select
          id="orders-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PhotobookOrderStatus | 'all')}
          className="w-full px-3 py-2 border border-caption rounded-round-eight font-ui text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'all'
                ? t('admin.orders.filterAll')
                : t(`admin.orders.status.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {orders.length === 0 ? (
        <p className="font-ui text-sm text-caption">{t('admin.orders.noOrders')}</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => {
            const quote = quotes[order.id];
            const address = order.shippingAddress;
            return (
              <li key={order.id}>
                <SettingsListRow
                  main={
                    <div className="space-y-1">
                      <p className="font-ui text-sm font-medium text-body">
                        {t('admin.orders.tripLabel')}: {order.tripName ?? order.tripId}
                      </p>
                      <p className="font-ui text-xs text-caption">
                        {t('admin.orders.userLabel')}: {order.userDisplayName ?? order.userId}
                      </p>
                      <p className="font-ui text-xs text-caption">
                        {address.recipientName}, {address.line1}, {address.townOrCity},{' '}
                        {address.postalOrZipCode} {address.countryCode}
                      </p>
                      <p className="font-ui text-xs text-caption">
                        {t(`admin.orders.status.${order.status}`)} ·{' '}
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                      {order.status === 'failed' && order.errorMessage ? (
                        <p className="font-ui text-xs text-red-700 dark:text-red-300">
                          {order.errorMessage}
                        </p>
                      ) : null}
                      {quote ? (
                        <div className="font-ui text-xs text-body mt-1">
                          <p className="font-semibold">
                            {t('admin.orders.quoteTotal')}: {quote.totalCost.amount}{' '}
                            {quote.totalCost.currency}
                          </p>
                          <p className="text-caption">
                            {t('admin.orders.quoteItems')}: {quote.items.amount}{' '}
                            {quote.items.currency} · {t('admin.orders.quoteShipping')}:{' '}
                            {quote.shipping.amount} {quote.shipping.currency}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  }
                  actions={
                    <div className="flex flex-col gap-2 items-end">
                      <button
                        type="button"
                        onClick={() => quoteMutation.mutate(order.id)}
                        disabled={quoteMutation.isPending}
                        className="px-3 py-1 border border-caption text-caption font-ui text-xs font-semibold rounded-round-eight hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                      >
                        {t('admin.orders.getQuote')}
                      </button>
                      <button
                        type="button"
                        onClick={() => approveMutation.mutate(order.id)}
                        disabled={approveMutation.isPending}
                        className="px-3 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded-round-eight hover:bg-accent hover:text-white transition-all disabled:opacity-50"
                      >
                        {t('admin.orders.approve')}
                      </button>
                      <input
                        type="text"
                        value={rejectReasons[order.id] ?? ''}
                        onChange={(e) =>
                          setRejectReasons((prev) => ({ ...prev, [order.id]: e.target.value }))
                        }
                        placeholder={t('admin.orders.rejectReasonLabel')}
                        aria-label={t('admin.orders.rejectReasonLabel')}
                        className="w-40 px-2 py-1 border border-caption/40 rounded-round-eight font-ui text-xs text-body bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={() => rejectMutation.mutate(order.id)}
                        disabled={rejectMutation.isPending}
                        className="px-3 py-1 border border-caption text-caption font-ui text-xs font-semibold rounded-round-eight hover:border-red-500 hover:text-red-500 transition-all disabled:opacity-50"
                      >
                        {t('admin.orders.reject')}
                      </button>
                      {order.status === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => retryMutation.mutate(order.id)}
                          disabled={retryMutation.isPending}
                          className="px-3 py-1 border border-accent text-accent font-ui text-xs font-semibold rounded-round-eight hover:bg-accent hover:text-white transition-all disabled:opacity-50"
                        >
                          {t('admin.orders.retry')}
                        </button>
                      ) : null}
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
