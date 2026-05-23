import { useState, useEffect } from 'react';
import { subscribeToCampaign, type Campaign } from '@/lib/firebase/campaigns';
import { subscribeToWorld, type World } from '@/lib/firebase/worlds';
import { WORLD_KEYS } from '@/lib/worldData';

export function useCampaignAndWorld(campaignId: string) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [campaignError, setCampaignError] = useState<Error | null>(null);
  const [worldError, setWorldError] = useState<Error | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [worldLoading, setWorldLoading] = useState(true);

  // 1. Subscribe to Campaign
  useEffect(() => {
    setCampaignLoading(true);
    return subscribeToCampaign(
      campaignId,
      (c) => {
        setCampaign(c);
        setCampaignLoading(false);
      },
      (err) => {
        setCampaignError(err);
        setCampaignLoading(false);
      }
    );
  }, [campaignId]);

  // 2. Subscribe to World if campaign.worldId is present
  useEffect(() => {
    if (!campaign) {
      // Don't change world loading state until we know if there is a campaign
      return;
    }
    if (!campaign.worldId) {
      setWorld(null);
      setWorldLoading(false);
      return;
    }
    setWorldLoading(true);
    return subscribeToWorld(
      campaign.worldId,
      (w) => {
        setWorld(w);
        setWorldLoading(false);
      },
      (err) => {
        setWorldError(err);
        setWorldLoading(false);
      }
    );
  }, [campaign?.worldId]); // intentionally depend only on worldId, not the whole campaign object

  const loading = campaignLoading || worldLoading;
  const error = campaignError || worldError;

  let mergedCampaign = campaign;
  if (campaign && world) {
    const mergedData = { ...campaign.data };
    
    // Strict inheritance: World lore overrides campaign data
    for (const key of WORLD_KEYS) {
      if (world.data[key] !== undefined) {
        mergedData[key] = world.data[key];
      }
    }
    
    mergedCampaign = {
      ...campaign,
      data: mergedData,
    };
  }

  return {
    campaign: mergedCampaign,
    rawCampaign: campaign,
    world,
    loading,
    error,
  };
}
