import type { Campaign } from '@/lib/firebase/campaigns';
import type { World } from '@/lib/firebase/worlds';

export type CampaignEditorProps = {
  campaign: Campaign;
  rawCampaign?: Campaign;
  world?: World | null;
  userEmail: string;
  isPro?: boolean;
  worldOnlyMode?: boolean;
  /** When provided, campaign.data writes are routed through the Yjs CRDT
   * layer rather than directly to the Firestore doc. Provided by
   * `useCampaignAndWorld` on the main campaign detail page. */
  crdtApply?: (next: Record<string, any>) => void | Promise<void>;
};
