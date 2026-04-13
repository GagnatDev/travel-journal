export async function uploadMedia(
  tripId: string,
  blob: Blob,
  width: number,
  height: number,
  token: string,
): Promise<{ key: string; thumbnailKey?: string; url: string }> {
  const formData = new FormData();
  formData.append('file', blob, 'image.jpg');
  formData.append('tripId', tripId);
  formData.append('width', String(width));
  formData.append('height', String(height));

  const res = await fetch('/api/v1/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? 'Upload failed');
  }

  return res.json() as Promise<{ key: string; thumbnailKey?: string; url: string }>;
}
