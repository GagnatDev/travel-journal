/**
 * Ordering a physical copy of a trip's photobook via Prodigi's Print API.
 *
 * The app absorbs the print cost for now; ordering is gated per-user
 * (`PublicUser.photobookOrderingEnabled`) and each order is approved by an
 * admin before it is submitted to Prodigi. The state machine below leaves room
 * for a future payment step and a future Prodigi status-callback webhook
 * without a schema change.
 */

/** ISO 3166-1 alpha-2 country code (e.g. `NO`, `GB`, `US`). */
export type CountryCode = string;

/** Prodigi recipient/shipping details captured at order time. */
export interface ShippingAddress {
  recipientName: string;
  email?: string;
  phoneNumber?: string;
  line1: string;
  line2?: string;
  townOrCity: string;
  stateOrCounty?: string;
  postalOrZipCode: string;
  countryCode: CountryCode;
}

/** Prodigi shipping tiers. We default to `Budget` (cheapest) since cost is absorbed. */
export type ProdigiShippingMethod =
  | 'Budget'
  | 'Standard'
  | 'StandardPlus'
  | 'Express'
  | 'Overnight';

/**
 * Order lifecycle.
 *
 * `requested → awaiting_approval → submitting → submitted`
 * Side states: `rejected` (admin), `failed` (Prodigi error; retryable), `cancelled`.
 * When admin approval is disabled (`PHOTOBOOK_ORDER_REQUIRE_APPROVAL=false`),
 * `awaiting_approval` is skipped and the order goes straight to `submitting`.
 */
export type PhotobookOrderStatus =
  | 'requested'
  | 'awaiting_approval'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'rejected'
  | 'cancelled';

/** A single money amount from a Prodigi quote. */
export interface ProdigiCost {
  amount: string;
  currency: string;
}

/** Cost breakdown fetched from Prodigi's quote endpoint, shown to the admin at approval. */
export interface ProdigiQuote {
  items: ProdigiCost;
  shipping: ProdigiCost;
  totalCost: ProdigiCost;
  /** ISO time the quote was fetched. */
  fetchedAt: string;
}

export interface PhotobookOrder {
  id: string;
  tripId: string;
  tripName?: string;
  userId: string;
  userDisplayName?: string;
  status: PhotobookOrderStatus;
  shippingAddress: ShippingAddress;
  shippingMethod: ProdigiShippingMethod;
  copies: number;
  /** SKU the order was placed against (snapshotted in case the configured SKU changes). */
  sku?: string;
  pageCount?: number;
  /** Prodigi's order id once submitted (used to look the order up in their dashboard). */
  prodigiOrderId?: string;
  prodigiQuote?: ProdigiQuote;
  /** When status is `failed`, a short display message. */
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePhotobookOrderRequest {
  shippingAddress: ShippingAddress;
  copies?: number;
  /** When true, persist the address back onto the user's profile for reuse. */
  saveAddressToProfile?: boolean;
}
