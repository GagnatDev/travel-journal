export interface EntryImage {
  key: string;
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
  /** ISO 8601 — set when syncing an entry first saved offline so server createdAt matches. */
  clientCreatedAt?: string;
}

export interface UpdateEntryRequest {
  title?: string;
  content?: string;
  images?: EntryImage[]; // full replacement array
  location?: EntryLocation | null;
}
