export interface EntryImage {
  key: string;
  /** Smaller derivative in object storage; omit on legacy entries. */
  thumbnailKey?: string;
  width: number;
  height: number;
  order: number;
  uploadedAt: string;
}

export interface EntryLocation {
  lat: number;
  lng: number;
  name?: string;
}

export type ReactionEmoji = '❤️' | '👍' | '😂';

export interface Reaction {
  emoji: ReactionEmoji;
  userId: string;
  createdAt: string;
}

/** Draft entries are visible only to trip creators and contributors until published. */
export type EntryPublicationStatus = 'draft' | 'published';

export interface Comment {
  id: string;
  entryId: string;
  tripId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: string;
  tripId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  images: EntryImage[];
  location?: EntryLocation;
  reactions: Reaction[];
  /** Omitted on legacy API responses; treat as `published`. */
  publicationStatus?: EntryPublicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AddCommentRequest {
  content: string;
}

export interface CreateEntryRequest {
  title: string;
  content: string;
  images?: EntryImage[];
  location?: EntryLocation;
  /** When `draft`, followers do not see the entry until it is published. */
  publicationStatus?: EntryPublicationStatus;
  /** ISO 8601 — set when syncing an entry first saved offline so server createdAt matches. */
  clientCreatedAt?: string;
}

export interface UpdateEntryRequest {
  title?: string;
  content?: string;
  images?: EntryImage[]; // full replacement array
  location?: EntryLocation | null;
  /** Set to `published` to make a draft visible to followers and send new-entry notifications. */
  publicationStatus?: Extract<EntryPublicationStatus, 'published'>;
}
