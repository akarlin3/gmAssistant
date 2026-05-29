'use client';

import React from 'react';

export const inputCls =
  'w-full border-b border-rule bg-transparent px-1 py-1 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none';

export const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
    {children}
  </div>
);

export const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="font-display text-xs uppercase tracking-wider text-crimson">{children}</div>
);

export const chipBtn = (active: boolean) =>
  `text-[10px] px-2 py-1 rounded border font-display uppercase tracking-wider transition-colors ${
    active
      ? 'border-wine/50 bg-wine/15 text-wine'
      : 'border-rule text-ink-mute hover:bg-parchment-deep'
  }`;
