'use client';

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { parseSpoilerSegments, redactSpoilers } from '@/lib/playerMode/spoilers';
import { useWiki } from './WikiContext';
import { buildEntityIndex, type WikiEntity } from '@/lib/wiki/entities';
import { ENTITY_COLORS, ENTITY_LABELS } from '@/lib/wiki/colors';
import type { EntityType } from '@/lib/wiki/types';

export type MentionTextProps = {
  text: string | undefined | null;
  playerSafe?: boolean;
  campaignData?: Record<string, any> | null;
  onEntityClick?: (type: EntityType, id: string, name: string) => void;
  onNavigate?: (type: EntityType, id: string) => void;
  className?: string;
};

const MENTION_TOKEN_RE = /(@(?:"[^"]+"|[A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*){0,3}))/g;

export function MentionText({
  text,
  playerSafe = false,
  campaignData,
  onEntityClick,
  onNavigate,
  className = '',
}: MentionTextProps) {
  const wiki = useWiki();
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<number, boolean>>({});

  const fallbackEntities = useMemo<WikiEntity[]>(() => {
    if (wiki) return wiki.index.entities;
    if (campaignData) return buildEntityIndex(campaignData).entities;
    return [];
  }, [wiki, campaignData]);

  const handleClick = (type: EntityType, id: string, name: string) => {
    if (onEntityClick) {
      onEntityClick(type, id, name);
    } else if (onNavigate) {
      onNavigate(type, id);
    } else {
      wiki?.navigateToEntity?.(type, id);
    }
  };

  if (!text) return null;

  if (playerSafe) {
    const clean = redactSpoilers(text);
    if (!clean) return null;
    return (
      <span className={className}>
        {renderTokensWithMentions(clean, fallbackEntities, handleClick)}
      </span>
    );
  }

  const segments = parseSpoilerSegments(text);
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'spoiler') {
          const isOpen = !!revealedSpoilers[i];
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRevealedSpoilers((prev) => ({ ...prev, [i]: !prev[i] }));
              }}
              className={`mx-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-serif text-xs transition-colors ${
                isOpen
                  ? 'border-crimson/50 bg-crimson/10 text-crimson'
                  : 'border-ink-mute/40 bg-parchment-deep text-ink-mute hover:border-crimson/40 hover:text-ink'
              }`}
              title={
                isOpen
                  ? 'GM Spoiler Block (redacted in /player-view) — click to mask'
                  : 'GM Spoiler Block (redacted in /player-view) — click to reveal'
              }
            >
              {isOpen ? <Eye size={10} /> : <EyeOff size={10} />}
              <span className="font-display text-[9px] uppercase tracking-wider">GM Spoiler:</span>
              <span>{isOpen ? seg.content : '••••••'}</span>
            </button>
          );
        }
        return (
          <React.Fragment key={i}>
            {renderTokensWithMentions(seg.content, fallbackEntities, handleClick)}
          </React.Fragment>
        );
      })}
    </span>
  );
}

function renderTokensWithMentions(
  content: string,
  entities: WikiEntity[],
  onClick: (type: EntityType, id: string, name: string) => void,
): React.ReactNode {
  if (!content.includes('@') || entities.length === 0) return content;

  const parts = content.split(MENTION_TOKEN_RE);

  return parts.map((part, idx) => {
    if (!part.startsWith('@')) return part;
    const raw = part.slice(1).replace(/^"|"$/g, '').trim();
    if (!raw) return part;

    // Try longest prefix match against known entities
    const words = raw.split(/\s+/);
    let matched: WikiEntity | undefined;
    let matchedWordsCount = words.length;

    for (let take = words.length; take >= 1; take--) {
      const candidate = words.slice(0, take).join(' ').toLowerCase();
      const found = entities.find((e) => e.name.toLowerCase() === candidate);
      if (found) {
        matched = found;
        matchedWordsCount = take;
        break;
      }
    }

    if (!matched) return part;

    const matchedText = part.startsWith('@"')
      ? `@"${words.slice(0, matchedWordsCount).join(' ')}"`
      : `@${words.slice(0, matchedWordsCount).join(' ')}`;
    const trailing =
      matchedWordsCount < words.length ? ' ' + words.slice(matchedWordsCount).join(' ') : '';

    return (
      <React.Fragment key={idx}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick(matched!.type, matched!.id, matched!.name);
          }}
          className="mx-0.5 inline-flex items-center gap-1 rounded border border-brass-deep/40 bg-brass/10 px-1.5 py-px font-display text-[11px] text-brass-deep hover:border-crimson hover:bg-crimson/10 hover:text-crimson"
          title={`Inspect connected lore for ${ENTITY_LABELS[matched.type]}: ${matched.name}`}
        >
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: ENTITY_COLORS[matched.type] }}
          />
          {matchedText}
        </button>
        {trailing}
      </React.Fragment>
    );
  });
}

export default MentionText;
