import type {
  CreatePhotobookOrderRequest,
  PhotobookOrder,
  PhotobookOrderStatus,
  ProdigiQuote,
} from '@travel-journal/shared';

import { apiJson } from './client.js';

export function createPhotobookOrder(
  tripId: string,
  body: CreatePhotobookOrderRequest,
  token: string,
): Promise<PhotobookOrder> {
  return apiJson<PhotobookOrder>(`/api/v1/trips/${tripId}/photobook/order`, {
    method: 'POST',
    token,
    body,
  });
}

export function fetchMyPhotobookOrder(
  tripId: string,
  token: string,
): Promise<PhotobookOrder | null> {
  return apiJson<PhotobookOrder | null>(`/api/v1/trips/${tripId}/photobook/order`, {
    token,
  });
}

export function fetchAdminPhotobookOrders(
  token: string,
  status?: PhotobookOrderStatus | 'all',
): Promise<PhotobookOrder[]> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return apiJson<PhotobookOrder[]>(`/api/v1/admin/photobook-orders${query}`, { token });
}

export function fetchPhotobookOrderQuote(
  orderId: string,
  token: string,
): Promise<ProdigiQuote> {
  return apiJson<ProdigiQuote>(`/api/v1/admin/photobook-orders/${orderId}/quote`, {
    token,
  });
}

export function approvePhotobookOrder(
  orderId: string,
  token: string,
): Promise<PhotobookOrder> {
  return apiJson<PhotobookOrder>(`/api/v1/admin/photobook-orders/${orderId}/approve`, {
    method: 'POST',
    token,
  });
}

export function rejectPhotobookOrder(
  orderId: string,
  reason: string | undefined,
  token: string,
): Promise<PhotobookOrder> {
  return apiJson<PhotobookOrder>(`/api/v1/admin/photobook-orders/${orderId}/reject`, {
    method: 'POST',
    token,
    body: { reason },
  });
}

export function retryPhotobookOrder(
  orderId: string,
  token: string,
): Promise<PhotobookOrder> {
  return apiJson<PhotobookOrder>(`/api/v1/admin/photobook-orders/${orderId}/retry`, {
    method: 'POST',
    token,
  });
}
