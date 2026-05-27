import { createContext } from 'react';

export const CampaignPlayModeContext = createContext<'solo' | 'duet' | 'standard'>('standard');
