'use client';

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
} from 'firebase/firestore';
import { getDb } from './client';
import { Campaign } from './campaigns';

/**
 * Fetches a single page of campaigns owned by or shared with `userId`.
 *
 * @param userId   - The authenticated user's UID.
 * @param pageSize - Number of campaigns per page (default 20).
 * @param lastDoc  - The last `DocumentSnapshot` from the previous page, or
 *                   undefined to fetch the first page.
 * @returns An object with the fetched campaigns, the last snapshot for
 *          cursor-based pagination, and a `hasMore` flag.
 */
export async function fetchCampaignsPage(
  userId: string,
  pageSize = 20,
  lastDoc?: DocumentSnapshot,
): Promise<{
  campaigns: Campaign[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}> {
  const col = collection(getDb(), 'campaigns');

  // Request one extra document so we can determine whether more pages exist
  // without an additional round-trip.
  const constraints = [
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc'),
    limit(pageSize + 1),
    ...(lastDoc ? [startAfter(lastDoc)] : []),
  ];

  const snap = await getDocs(query(col, ...constraints));
  const docs = snap.docs;

  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

  const campaigns: Campaign[] = pageDocs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Campaign, 'id'>) }),
  );

  const newLastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

  return { campaigns, lastDoc: newLastDoc, hasMore };
}
