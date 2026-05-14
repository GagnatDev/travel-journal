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
  /** When creating from a saved map pin — server validates and removes that bookmark atomically with the entry. */
  consumedSavedLocationId?: string;
}

/** Entry-backed pin on trip map */
export interface MapPinEntry {
  kind: 'entry';
  entryId: string;
  title: string;
  lat: number;
  lng: number;
  name?: string;
  createdAt: string;
}

/** Quick-saved bookmark on trip map */
export interface MapPinSavedLocation {
  kind: 'savedLocation';
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  savedByUserId: string;
  savedByDisplayName: string;
  name?: string;
}

export type MapPin = MapPinEntry | MapPinSavedLocation;

export interface CreateSavedLocationRequest {
  lat: number;
  lng: number;
  name?: string;
}

/** Router state passed when opening the composer from a saved map bookmark. */
export interface ComposeFromSavedLocationPayload {
  savedLocationId: string;
  lat: number;
  lng: number;
  name?: string;
}

export interface UpdateEntryRequest {
  title?: string;
  content?: string;
  images?: EntryImage[]; // full replacement array
  location?: EntryLocation | null;
}
