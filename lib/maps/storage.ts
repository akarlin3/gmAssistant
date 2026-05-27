'use client';

// Client-side map image storage. The Admin SDK isn't available in this
// deployment (org policy blocks service-account keys — see CLAUDE.md), so the
// GM browser uploads straight to Firebase Storage under maps/{uid}/{mapId}/*,
// secured by storage.rules. This mirrors how the pro-waitlist writes Firestore
// directly from the Web SDK.

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase/client';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type UploadedImage = { url: string; path: string; width: number; height: number };

function extForType(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

// Validate a user-selected file. Returns an error message, or null when valid.
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    return 'Unsupported format — use PNG, JPG, or WebP.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image too large — max 5 MB.';
  }
  if (file.size === 0) return 'That file is empty.';
  return null;
}

// Read intrinsic pixel dimensions in the browser. Tries createImageBitmap first
// (fast, no DOM), falling back to an <img> element.
async function readDimensions(file: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      if (dims.width > 0 && dims.height > 0) return dims;
    } catch {
      // fall through to <img>
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1024, height: img.naturalHeight || 768 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 1024, height: 768 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function uploadMapImage(
  uid: string,
  mapId: string,
  file: File,
): Promise<UploadedImage> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);
  const dims = await readDimensions(file);
  const path = `maps/${uid}/${mapId}/image.${extForType(file.type)}`;
  const storage = getStorage(getFirebaseApp());
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, file, { contentType: file.type });
  const url = await getDownloadURL(objectRef);
  return { url, path, width: dims.width, height: dims.height };
}

// Upload a base64 PNG returned by the AI generation endpoint.
export async function uploadGeneratedImage(
  uid: string,
  mapId: string,
  base64Png: string,
): Promise<UploadedImage> {
  const blob = base64ToBlob(base64Png, 'image/png');
  const path = `maps/${uid}/${mapId}/image.png`;
  const storage = getStorage(getFirebaseApp());
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, blob, { contentType: 'image/png' });
  const url = await getDownloadURL(objectRef);
  const dims = await readDimensions(blob);
  return { url, path, width: dims.width, height: dims.height };
}

export async function deleteMapImage(path: string): Promise<void> {
  if (!path) return;
  try {
    const storage = getStorage(getFirebaseApp());
    await deleteObject(ref(storage, path));
  } catch {
    // Best-effort: a missing object (already deleted) is fine.
  }
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes as unknown as BlobPart], { type });
}
