'use client';

import React from 'react';

export interface GuidedEmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  primary?: boolean;
  icon?: React.ReactNode;
}

export interface GuidedEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actions?: GuidedEmptyStateAction[];
  children?: React.ReactNode;
  className?: string;
}

export function GuidedEmptyState({
  icon,
  title,
  description,
  actions = [],
  children,
  className = '',
}: GuidedEmptyStateProps) {
  return (
    <div
      className={`mx-auto flex max-w-xl flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-10 text-center shadow-card ${className}`}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-lg text-[var(--accent-primary)]">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-semibold tracking-wide text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mt-1.5 max-w-md font-sans text-sm leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {actions.map((action, idx) => {
            const isPrimary = action.primary ?? (action.variant ?? (idx === 0 ? 'primary' : 'secondary')) === 'primary';
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={
                  isPrimary
                    ? 'inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 font-sans text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95'
                    : 'inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 font-sans text-xs font-medium text-[var(--text-primary)] transition-all hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] active:scale-95'
                }
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {children && <div className="mt-4 w-full">{children}</div>}
    </div>
  );
}
