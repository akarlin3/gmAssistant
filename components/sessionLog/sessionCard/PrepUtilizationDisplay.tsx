import type { LinkedPrepItem } from '@/lib/sessionLog';

type Props = {
  linkedItems: LinkedPrepItem[];
  isGhostItem: (item: LinkedPrepItem) => boolean;
};

export function PrepUtilizationDisplay({ linkedItems, isGhostItem }: Props) {
  if (linkedItems.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 rounded border border-rule bg-parchment-soft/40 p-3">
      <div className="border-b border-rule/30 pb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Prep Utilized in Session</div>
      <div className="grid grid-cols-1 gap-3 font-serif text-xs text-ink-soft sm:grid-cols-2 md:grid-cols-4">
        {/* NPCs */}
        <div>
          <span className="mb-1 block font-display text-[9px] uppercase tracking-wider text-ink-mute">NPCs</span>
          {linkedItems.filter(i => i.type === 'npc').length === 0 ? (
            <span className="text-[10px] italic text-ink-mute">None</span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-3">
              {linkedItems.filter(i => i.type === 'npc').map(item => {
                const ghost = isGhostItem(item);
                return (
                  <li key={item.id}>
                    <span className={ghost ? "italic text-ink-mute" : "text-ink"}>
                      {item.snapshotName}
                      {ghost && <span className="ml-1 inline-block scale-90 rounded bg-wine/10 px-0.5 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Locations */}
        <div>
          <span className="mb-1 block font-display text-[9px] uppercase tracking-wider text-ink-mute">Locations</span>
          {linkedItems.filter(i => i.type === 'location').length === 0 ? (
            <span className="text-[10px] italic text-ink-mute">None</span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-3">
              {linkedItems.filter(i => i.type === 'location').map(item => {
                const ghost = isGhostItem(item);
                return (
                  <li key={item.id}>
                    <span className={ghost ? "italic text-ink-mute" : "text-ink"}>
                      {item.snapshotName}
                      {ghost && <span className="ml-1 inline-block scale-90 rounded bg-wine/10 px-0.5 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Encounters */}
        <div>
          <span className="mb-1 block font-display text-[9px] uppercase tracking-wider text-ink-mute">Encounters</span>
          {linkedItems.filter(i => i.type === 'encounter').length === 0 ? (
            <span className="text-[10px] italic text-ink-mute">None</span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-3">
              {linkedItems.filter(i => i.type === 'encounter').map(item => {
                const ghost = isGhostItem(item);
                return (
                  <li key={item.id}>
                    <span className={ghost ? "italic text-ink-mute" : "font-semibold text-ink"}>
                      {item.snapshotName}
                      {item.snapshotXP ? ` (${item.snapshotXP} XP)` : ''}
                      {ghost && <span className="ml-1 inline-block scale-90 rounded bg-wine/10 px-0.5 font-display text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Loot */}
        <div>
          <span className="mb-1 block font-display text-[9px] uppercase tracking-wider text-ink-mute">Loot</span>
          {linkedItems.filter(i => i.type === 'loot').length === 0 ? (
            <span className="text-[10px] italic text-ink-mute">None</span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-3">
              {linkedItems.filter(i => i.type === 'loot').map(item => {
                const ghost = isGhostItem(item);
                return (
                  <li key={item.id} title={item.snapshotLoot}>
                    <span className={ghost ? "italic text-ink-mute" : "text-ink"}>
                      {item.snapshotName}
                      {ghost && <span className="ml-1 inline-block scale-90 rounded bg-wine/10 px-0.5 font-display font-sans text-[8px] uppercase tracking-wider text-wine">Ghost</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
