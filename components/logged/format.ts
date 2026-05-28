import type { LogEntry } from '@/lib/generators/log';
import {
  asPayload,
  type GeneratedName,
  type InventoryItem,
  type MagicItem,
  type MenuItem,
  type NamedDescriptor,
  type PlotSegue,
  type Trinket,
  type Valuable,
  type DungeonRoom,
} from './types';

// ── FORMAT PLAIN TEXT UTIL (for Copy) ────────────────────────────────────────
export function formatPlainText(entry: LogEntry): string {
  const p = asPayload(entry.payload);
  const kind = entry.kind;

  if (kind === 'tavern') {
    const d = p.details || {};
    return [
      p.name,
      `${p.inputs?.vibe || 'Cozy'} · ${p.inputs?.settlementSize || 'Town'}`,
      d.atmosphere,
      `Proprietor: ${d.owner?.name} — ${d.owner?.descriptor}`,
      'Menu:',
      ...(d.menu || []).map((m: MenuItem) => `  - ${m.name} (${m.kind}) — ${m.price}`),
      'Patrons:',
      ...(d.patrons || []).map((pt: NamedDescriptor) => `  - ${pt.name} — ${pt.descriptor}`),
      'Rumors:',
      ...(d.rumors || []).map((rm: string) => `  - ${rm}`),
    ].join('\n');
  }

  if (kind === 'tavern-name') {
    return (p.names || []).join('\n');
  }

  if (kind === 'trinket') {
    return (p.trinkets || []).map((t: Trinket, idx: number) => `${idx + 1}. ${t.description}${t.hook ? ` (Plot Hook: ${t.hook})` : ''}`).join('\n');
  }

  if (kind === 'plot-segue') {
    return (p.segues || []).map((s: PlotSegue) => `${s.title}\n"${s.readAloud}"\nGM Note: ${s.gmNote || ''}`).join('\n\n');
  }

  if (kind === 'names') {
    return (p.names || []).map((n) => {
      const nm = n as GeneratedName;
      return `${nm.first} ${nm.last} (${nm.firstCulture})`;
    }).join('\n');
  }

  if (kind === 'locations') {
    const loc = p.location || p;
    return `${loc.name}\n${loc.type || ''}\n${loc.description || ''}`;
  }

  if (kind === 'mundane-shop' || kind === 'magic-shop') {
    const o = p.owner || {};
    return [
      p.shopName,
      `${p.inputs?.shopType || p.inputs?.archetype || 'Shop'} · ${p.inputs?.settlementSize || 'Town'}`,
      `Owner: ${o.name} — ${o.descriptor}`,
      'Inventory:',
      ...(p.inventory || []).map((it: InventoryItem) => `  - ${it.name} — ${it.price} (${it.rarity || 'mundane'})`),
    ].join('\n');
  }

  if (kind === 'treasure-hoard') {
    const c = p.coins || {};
    return [
      `Hoard (CR ${p.inputs?.crTier || '0-4'})`,
      `Coins: pp:${c.pp || 0}, gp:${c.gp || 0}, ep:${c.ep || 0}, sp:${c.sp || 0}, cp:${c.cp || 0}`,
      'Gems:',
      ...(p.gems || []).map((g: Valuable) => `  - ${g.name} — ${g.value}gp`),
      'Art Objects:',
      ...(p.artObjects || []).map((a: Valuable) => `  - ${a.name} — ${a.value}gp`),
      'Magic Items:',
      ...(p.magicItems || []).map((it: MagicItem) => `  - ${it.name} (${it.rarity})`),
    ].join('\n');
  }

  if (kind === 'settlement') {
    const d = p.details || {};
    return [
      p.name,
      `${d.sizeClass || 'Village'} · Pop. ${d.population || 'Unknown'}`,
      `Gov: ${d.government || 'Traditional'} · Econ: ${d.economy || 'Agriculture'}`,
      'Notables:',
      ...(d.notables || []).map((n) => `  - ${n.name} (${n.role})`),
      'Hooks:',
      ...(d.hooks || []).map((hk: string) => `  - ${hk}`),
    ].join('\n');
  }

  if (kind === 'dungeon') {
    const d = p.details || {};
    return [
      p.name,
      `Size: ${d.size} · Theme: ${p.inputs?.theme} · Tier: ${p.inputs?.challengeTier}`,
      `Hook: ${p.hook || ''}`,
      'Rooms:',
      ...(d.rooms || []).map((r: DungeonRoom) => `  Room ${r.index} [${r.name}]: ${r.contents}`),
    ].join('\n');
  }

  return JSON.stringify(p, null, 2);
}

// ── FORMAT MARKDOWN FOR PLAYER FEED (Share button) ──────────────────────────
export function formatMarkdownText(entry: LogEntry): string {
  const p = asPayload(entry.payload);
  const kind = entry.kind;
  const signature = `<!-- logged_item_id: ${entry.id} -->`;

  let md = `${signature}\n`;

  switch (kind) {
    case 'tavern': {
      const d = p.details || {};
      md += `### 🍺 Tavern: **${p.name}**\n`;
      md += `*${p.inputs?.vibe || 'Cozy'} tavern located in a ${p.inputs?.settlementSize || 'town'}*\n\n`;
      md += `> ${d.atmosphere}\n\n`;
      md += `**Proprietor:** ${d.owner?.name} — *${d.owner?.descriptor}*\n\n`;

      if (d.menu && d.menu.length > 0) {
        md += `#### **Menu Card**\n`;
        d.menu.slice(0, 10).forEach((m: MenuItem) => {
          md += `* **${m.name}** (${m.kind}) — \`${m.price}\`\n`;
        });
        md += `\n`;
      }

      if (d.rumors && d.rumors.length > 0) {
        md += `#### **Local Whispers**\n`;
        d.rumors.forEach((rm: string) => {
          md += `* *"${rm}"*\n`;
        });
      }
      break;
    }

    case 'tavern-name': {
      md += `### 🏨 **Tavern Names Catalog**\n`;
      (p.names || []).forEach((name) => {
        md += `* ${name}\n`;
      });
      break;
    }

    case 'trinket': {
      md += `### 🏺 **Discovered Trinkets**\n`;
      (p.trinkets || []).forEach((tr: Trinket, idx: number) => {
        md += `**Trinket #${idx + 1}**: *"${tr.description}"*\n`;
        if (tr.hook) md += `> *Potential hook: ${tr.hook}*\n`;
        md += `\n`;
      });
      break;
    }

    case 'plot-segue': {
      md += `### 📜 **Story Developments**\n`;
      (p.segues || []).forEach((seg: PlotSegue) => {
        md += `#### ✦ **${seg.title}**\n`;
        md += `> *${seg.readAloud}*\n\n`;
      });
      break;
    }

    case 'names': {
      md += `### 👥 **Discovered Names**\n`;
      md += `| Name | Culture / Tradition |\n`;
      md += `| :--- | :--- |\n`;
      (p.names || []).forEach((n) => {
        const nm = n as GeneratedName;
        const full = [nm.first, nm.last].filter(Boolean).join(' ');
        md += `| **${full}** | *${nm.firstCulture || 'Ancient Tradition'}* |\n`;
      });
      break;
    }

    case 'locations': {
      const loc = p.location || p;
      md += `### 🗺️ **Fantastic Location: ${loc.name}**\n`;
      if (loc.type) md += `*${loc.type}*\n\n`;
      if (loc.description) md += `> ${loc.description}\n\n`;
      const aspects = (loc.aspects || []) as string[];
      if (Array.isArray(loc.aspects) && aspects.filter(Boolean).length > 0) {
        md += `**Key Aspects:**\n`;
        aspects.filter(Boolean).forEach((asp: string) => {
          md += `* *${asp}*\n`;
        });
      }
      break;
    }

    case 'mundane-shop':
    case 'magic-shop': {
      const o = p.owner || {};
      const type = p.inputs?.shopType || p.inputs?.archetype || 'Specialty Shop';
      md += `### 🛍️ Merchant: **${p.shopName || 'Local Shop'}**\n`;
      md += `*${type} · Proprietor: ${o.name} (${o.descriptor})*\n\n`;

      if (p.inventory && p.inventory.length > 0) {
        md += `#### **Goods & Services**\n`;
        md += `| Item | Price | Rarity |\n`;
        md += `| :--- | :--- | :--- |\n`;
        p.inventory.slice(0, 15).forEach((it: InventoryItem) => {
          md += `| **${it.name}** | \`${it.price}\` | *${it.rarity || 'mundane'}* |\n`;
        });
        if (p.inventory.length > 15) {
          md += `\n*...and ${p.inventory.length - 15} additional items in stock.*`;
        }
      }
      break;
    }

    case 'treasure-hoard': {
      const c = p.coins || {};
      const gems = p.gems || [];
      const art = p.artObjects || [];
      const items = p.magicItems || [];

      md += `### 🪙 **Treasure Loot Catalog**\n`;
      md += `*Coins and valuables recovered during exploration:*\n\n`;

      // Coin table
      md += `| PP | GP | EP | SP | CP |\n`;
      md += `| :---: | :---: | :---: | :---: | :---: |\n`;
      md += `| **${c.pp || 0}** | **${c.gp || 0}** | **${c.ep || 0}** | **${c.sp || 0}** | **${c.cp || 0}** |\n\n`;

      if (gems.length > 0) {
        md += `**Gems Discovered:**\n`;
        gems.forEach((g: Valuable) => {
          md += `* 💎 ${g.name} (Value: \`${g.value}gp\`)\n`;
        });
        md += `\n`;
      }

      if (art.length > 0) {
        md += `**Art Objects Recovered:**\n`;
        art.forEach((a: Valuable) => {
          md += `* 🖼️ ${a.name} (Value: \`${a.value}gp\`)\n`;
        });
        md += `\n`;
      }

      if (items.length > 0) {
        md += `**Items Found:**\n`;
        items.forEach((it: MagicItem) => {
          md += `* 🛡️ ${it.name} — *${it.rarity}* ${it.note ? `(*${it.note}*)` : ''}\n`;
        });
      }
      break;
    }

    case 'settlement': {
      const d = p.details || {};
      md += `### 🏰 Settlement: **${p.name}**\n`;
      md += `*${d.sizeClass || 'Settlement'} · Region: ${d.region || 'Uncharted Land'} · Pop. ${d.population?.toLocaleString() || 'Unknown'}*\n\n`;
      md += `* **Government Style:** ${d.government || 'Traditional'}\n`;
      md += `* **Core Economy:** ${d.economy || 'Local Trade'}\n\n`;

      if (d.notables && d.notables.length > 0) {
        md += `**Notable Figures:**\n`;
        d.notables.forEach((n) => {
          md += `* **${n.name}** — *${n.role}*\n`;
        });
        md += `\n`;
      }

      if (p.currentSituation) {
        md += `**Current Situation:**\n> ${p.currentSituation}\n`;
      }
      break;
    }

    case 'dungeon': {
      const d = p.details || {};
      md += `### 💀 Ruin: **${p.name}**\n`;
      md += `*${d.size || 'Medium'} size exploration zone · Theme: ${p.inputs?.theme}*\n\n`;
      if (p.hook) md += `> *${p.hook}*\n\n`;
      if (d.hazards && d.hazards.length > 0) {
        md += `**Identified Hazards:**\n`;
        d.hazards.forEach((h: string) => {
          md += `* ⚠️ *${h}*\n`;
        });
      }
      break;
    }

    case 'monster-roll':
    case 'monster-scale': {
      const name = p.name || p.monsterName || 'Scaled Monster';
      md += `### 🦖 Encountered: **${name}**\n`;
      if (p.challengeRating) md += `*Challenge Level: CR ${p.challengeRating}*\n\n`;
      if (p.stats) {
        md += `| STR | DEX | CON | INT | WIS | CHA |\n`;
        md += `| :---: | :---: | :---: | :---: | :---: | :---: |\n`;
        md += `| **${p.stats.str || 10}** | **${p.stats.dex || 10}** | **${p.stats.con || 10}** | **${p.stats.int || 10}** | **${p.stats.wis || 10}** | **${p.stats.cha || 10}** |\n`;
      }
      break;
    }

    case 'dice': {
      md += `### 🎲 Dice Roll: **${p.result}**\n`;
      if (p.breakdown) md += `*Breakdown: ${p.breakdown}*\n`;
      break;
    }

    default:
      md += `### 📋 **Logged: ${entry.title}**\n`;
      md += `\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\``;
  }

  return md;
}
