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

export interface Entry {
  id: string;
  tripId: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  images: EntryImage[];
  location?: EntryLocation;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntryRequest {
  title: string;
  content: string;
  images?: EntryImage[];
  location?: EntryLocation;
}

export interface UpdateEntryRequest {
  title?: string;
  content?: string;
  images?: EntryImage[]; // full replacement array
  location?: EntryLocation | null;
}
