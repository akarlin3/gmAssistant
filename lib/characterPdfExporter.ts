import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import {
  ABILITY_NAMES,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type PlayerCharacter,
  type SkillName,
  type SpellSlotLevel,
} from './pc/types';
import { ALL_SKILLS, SKILL_ABILITIES } from './pc/skills';
import { abilityMod, savingThrowBonus } from './pc/derived';
import { redactSpoilers } from './playerMode/spoilers';
import { evaluateCharacterSheet } from './characterEvaluator';

export const GM_ASSISTANT_PDF_META_PREFIX = 'GMASSISTANT_PC_V1:';

export type PdfStylePreset = 'parchment' | 'ink-saver' | 'Parchment PHB' | 'Print-Friendly Ink Saver';

export type CharacterPdfExportOptions = {
  /** Export surface mode: 'gm' (default) or 'player' */
  mode?: 'gm' | 'player';
  /** Visual preset: 'parchment' ("Parchment PHB") or 'ink-saver' ("Print-Friendly Ink Saver") */
  stylePreset?: PdfStylePreset;
  /** GM Export only: explicitly opt-in to include GM-only notes/secrets (default: false) */
  includeGmSecrets?: boolean;
  /** Player Export only: include private (sharedWithGm: false) notes/quests/journals (default: true for personal backup, false when sharing) */
  includePrivateNotes?: boolean;
  /** Optional override to force or suppress Page 3 (Notes/Quests/Backstory) */
  includeNotesPage?: boolean;
  /** Include Tactical Evaluation footer on Page 2 (default: true) */
  includeTacticalEvaluation?: boolean;
};

export type CharacterPdfExportResult = Uint8Array & {
  bytes: Uint8Array;
  filename: string;
  redactedPc: PlayerCharacter;
};

function encodeUtf8Base64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Strips any characters outside WinAnsi (Latin-1 printable range) so pdf-lib's StandardFonts
 * never throw encoding errors on arbitrary Unicode input.
 */
function toPdfSafeText(input: unknown): string {
  if (input === null || input === undefined) return '';
  const str = String(input)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*');
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += str[i];
    } else {
      out += ' ';
    }
  }
  return out;
}

function cleanSpoilerText(text: string | undefined, stripGmSpoilers: boolean): string {
  if (!text) return '';
  return stripGmSpoilers ? redactSpoilers(text) : text;
}

/**
 * Deeply sanitizes a PC object according to the strict GM / Player PDF export privacy rules:
 * - GM Export (`includeGmSecrets: false` by default):
 *   Strips all GM-only fields (`gmNotes`, `gmSecrets`, inline `||...||` and `[gm]...[/gm]` tags,
 *   unrevealed secrets) AND never includes unshared player notes (`sharedWithGm === false`).
 * - Player Export (`includePrivateNotes: true` by default, toggleable to `false`):
 *   Zero access to GM-hidden data (`gmNotes`, `gmSecrets`, `||...||`, `[gm]...[/gm]` always stripped),
 *   and when `includePrivateNotes === false`, strips all `sharedWithGm === false` quests,
 *   annotations, journals, inventory items, and private notes.
 */
export function sanitizePcForPdfExport(
  rawPc: Partial<PlayerCharacter> & Record<string, unknown>,
  options: CharacterPdfExportOptions = {},
): PlayerCharacter {
  const mode = options.mode ?? 'gm';
  const includeGmSecrets = mode === 'gm' && options.includeGmSecrets === true;
  const includePrivateNotes =
    mode === 'player' ? (options.includePrivateNotes ?? true) : false;
  const stripGmSpoilers = !includeGmSecrets;

  const evaluated = evaluateCharacterSheet(rawPc);
  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(evaluated));

  // 1. Strip GM-only fields unless mode === 'gm' && includeGmSecrets === true
  if (stripGmSpoilers) {
    delete clone.gmNotes;
    delete clone.gmSecrets;
    delete clone.secretNote;
    delete clone.unknownSecretA;
    delete clone.unknownSecretB;
  }

  // 2. Filter quests, annotations, and journals by `sharedWithGm` when unshared player notes must be omitted
  const rawQuests = Array.isArray((rawPc as Record<string, unknown>).quests)
    ? ((rawPc as Record<string, unknown>).quests as Array<Record<string, unknown>>)
    : Array.isArray(rawPc.sharedQuests)
      ? (rawPc.sharedQuests as unknown as Array<Record<string, unknown>>)
      : [];

  const rawAnnotations = Array.isArray((rawPc as Record<string, unknown>).annotations)
    ? ((rawPc as Record<string, unknown>).annotations as Array<Record<string, unknown>>)
    : Array.isArray(rawPc.sharedAnnotations)
      ? (rawPc.sharedAnnotations as unknown as Array<Record<string, unknown>>)
      : [];

  const rawJournals = Array.isArray((rawPc as Record<string, unknown>).journal)
    ? ((rawPc as Record<string, unknown>).journal as Array<Record<string, unknown>>)
    : Array.isArray((rawPc as Record<string, unknown>).journalEntries)
      ? ((rawPc as Record<string, unknown>).journalEntries as Array<Record<string, unknown>>)
      : Array.isArray(rawPc.sharedJournal)
        ? (rawPc.sharedJournal as unknown as Array<Record<string, unknown>>)
        : [];

  const filterSharedItem = (item: Record<string, unknown>): boolean => {
    if (!item || typeof item !== 'object') return false;
    if (includePrivateNotes) return true;
    return item.sharedWithGm === true;
  };

  clone.sharedQuests = rawQuests
    .filter(filterSharedItem)
    .map((q) => ({
      ...q,
      title: cleanSpoilerText(String(q.title ?? ''), stripGmSpoilers),
      notes: cleanSpoilerText(String(q.notes ?? ''), stripGmSpoilers),
    }));
  delete clone.quests;

  clone.sharedAnnotations = rawAnnotations
    .filter(filterSharedItem)
    .map((a) => ({
      ...a,
      privateNotes: includePrivateNotes
        ? cleanSpoilerText(String(a.privateNotes ?? ''), stripGmSpoilers)
        : a.sharedWithGm === true
          ? cleanSpoilerText(String(a.sharedNotes ?? a.privateNotes ?? ''), stripGmSpoilers)
          : '',
      ...(a.sharedNotes !== undefined
        ? { sharedNotes: cleanSpoilerText(String(a.sharedNotes ?? ''), stripGmSpoilers) }
        : {}),
    }));
  delete clone.annotations;

  clone.sharedJournal = rawJournals
    .filter(filterSharedItem)
    .map((j) => ({
      ...j,
      title: cleanSpoilerText(String(j.title ?? ''), stripGmSpoilers),
      content: cleanSpoilerText(String(j.content ?? ''), stripGmSpoilers),
    }));
  delete clone.journal;
  delete clone.journalEntries;

  // 3. Filter inventory items that are explicitly marked sharedWithGm: false when private notes are excluded
  if (Array.isArray(clone.inventory)) {
    clone.inventory = (clone.inventory as Array<Record<string, unknown>>)
      .filter((item) => {
        if (!includePrivateNotes && item.sharedWithGm === false) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        name: cleanSpoilerText(String(item.name ?? ''), stripGmSpoilers),
        ...(item.description !== undefined
          ? { description: cleanSpoilerText(String(item.description ?? ''), stripGmSpoilers) }
          : {}),
        ...(item.notes !== undefined
          ? { notes: cleanSpoilerText(String(item.notes ?? ''), stripGmSpoilers) }
          : {}),
      }));
  }

  // 4. Clean freeform strings (notes, backstory, privateNotes, partyLoot, features, attacks, goals, bonds, ideals, flaws)
  if (!includePrivateNotes) {
    delete clone.privateNotes;
    if (mode === 'player' && options.includePrivateNotes === false) {
      clone.notes = '';
      delete clone.backstory;
    }
  } else if (typeof clone.privateNotes === 'string') {
    clone.privateNotes = cleanSpoilerText(clone.privateNotes, stripGmSpoilers);
  }

  clone.notes = cleanSpoilerText(String(clone.notes ?? ''), stripGmSpoilers);
  if (typeof clone.backstory === 'string') {
    clone.backstory = cleanSpoilerText(clone.backstory, stripGmSpoilers);
  }
  if (typeof clone.partyLoot === 'string') {
    clone.partyLoot = cleanSpoilerText(clone.partyLoot, stripGmSpoilers);
  }
  if (typeof clone.gmNotes === 'string') {
    clone.gmNotes = cleanSpoilerText(clone.gmNotes, stripGmSpoilers);
  }

  for (const listKey of ['goals', 'bonds', 'ideals', 'flaws', 'spellsKnown'] as const) {
    if (Array.isArray(clone[listKey])) {
      clone[listKey] = (clone[listKey] as string[]).map((s) =>
        cleanSpoilerText(String(s ?? ''), stripGmSpoilers),
      );
    }
  }

  if (Array.isArray(clone.features)) {
    clone.features = (clone.features as Array<Record<string, unknown>>).map((f) => ({
      ...f,
      name: cleanSpoilerText(String(f.name ?? ''), stripGmSpoilers),
      source: cleanSpoilerText(String(f.source ?? ''), stripGmSpoilers),
      description: cleanSpoilerText(String(f.description ?? ''), stripGmSpoilers),
    }));
  }

  if (Array.isArray(clone.attacks)) {
    clone.attacks = (clone.attacks as Array<Record<string, unknown>>).map((a) => ({
      ...a,
      name: cleanSpoilerText(String(a.name ?? ''), stripGmSpoilers),
      ...(a.notes !== undefined
        ? { notes: cleanSpoilerText(String(a.notes ?? ''), stripGmSpoilers) }
        : {}),
    }));
  }

  return clone as unknown as PlayerCharacter;
}

export function buildCharacterSheetPdfFilename(pc: Pick<PlayerCharacter, 'name' | 'level'>): string {
  const safeName = (pc.name || 'Character')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Character';
  const lvl = Math.max(1, Math.min(20, pc.level || 1));
  return `${safeName}-Lv${lvl}-Sheet.pdf`;
}

/**
 * Generates an interactive, fillable AcroForm TTRPG Character Sheet PDF (`<CharacterName>-Lv<Level>-Sheet.pdf`)
 * with embedded lossless `gmAssistant` JSON metadata for 1:1 Tier-1 round-trip hydration.
 */
export async function exportCharacterSheetPdf(
  rawPc: Partial<PlayerCharacter> & Record<string, unknown>,
  options: CharacterPdfExportOptions = {},
): Promise<CharacterPdfExportResult> {
  const redactedPc = sanitizePcForPdfExport(rawPc, options);
  const evaluated = evaluateCharacterSheet(redactedPc);
  // Keep redacted fields on evaluated snapshot
  const pc: PlayerCharacter = {
    ...evaluated,
    notes: redactedPc.notes,
    backstory: redactedPc.backstory,
    privateNotes: redactedPc.privateNotes,
    gmNotes: redactedPc.gmNotes,
    gmSecrets: redactedPc.gmSecrets,
    sharedQuests: redactedPc.sharedQuests,
    sharedAnnotations: redactedPc.sharedAnnotations,
    sharedJournal: redactedPc.sharedJournal,
    inventory: redactedPc.inventory,
  };

  const isParchment =
    options.stylePreset === undefined ||
    options.stylePreset === 'parchment' ||
    options.stylePreset === 'Parchment PHB';

  const palette = isParchment
    ? {
        bg: rgb(0.98, 0.95, 0.89),
        boxBg: rgb(0.95, 0.91, 0.82),
        headerBg: rgb(0.38, 0.11, 0.09),
        headerText: rgb(0.99, 0.96, 0.90),
        border: rgb(0.55, 0.36, 0.18),
        accent: rgb(0.45, 0.12, 0.10),
        text: rgb(0.14, 0.11, 0.09),
        muted: rgb(0.40, 0.34, 0.28),
      }
    : {
        bg: rgb(1, 1, 1),
        boxBg: rgb(0.97, 0.97, 0.98),
        headerBg: rgb(0.15, 0.18, 0.22),
        headerText: rgb(1, 1, 1),
        border: rgb(0.25, 0.28, 0.32),
        accent: rgb(0.12, 0.15, 0.20),
        text: rgb(0.08, 0.09, 0.11),
        muted: rgb(0.42, 0.45, 0.50),
      };

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontTitle = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Embed lossless JSON metadata in PDF Subject & Keywords so Tier 1 parser hydrates 1:1
  const encodedMetadata = `${GM_ASSISTANT_PDF_META_PREFIX}${encodeUtf8Base64(JSON.stringify(pc))}`;
  const filename = buildCharacterSheetPdfFilename(pc);
  pdfDoc.setTitle(toPdfSafeText(`${pc.name || 'Character'} - Level ${pc.level} Character Sheet`));
  pdfDoc.setAuthor('gmAssistant Character Sheet Exporter');
  pdfDoc.setCreator('gmAssistant Offline PDF Engine');
  pdfDoc.setProducer('gmAssistant v1');
  pdfDoc.setSubject(encodedMetadata);
  pdfDoc.setKeywords([encodedMetadata, 'gmAssistant', `level:${pc.level}`]);

  const form = pdfDoc.getForm();

  const drawPageBackground = (page: PDFPage, pageTitle: string, pageNum: number) => {
    const { width, height } = page.getSize();
    if (isParchment) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: palette.bg,
      });
    }
    // Outer decorative frame
    page.drawRectangle({
      x: 18,
      y: 18,
      width: width - 36,
      height: height - 36,
      borderColor: palette.border,
      borderWidth: 1.5,
    });
    // Footer
    page.drawText(
      toPdfSafeText(
        `gmAssistant Character Sheet  |  ${pc.name || 'Unnamed Hero'} (Lv. ${pc.level})  |  ${pageTitle} (Page ${pageNum})`,
      ),
      {
        x: 28,
        y: 24,
        size: 7.5,
        font: fontRegular,
        color: palette.muted,
      },
    );
  };

  const drawSectionBox = (
    page: PDFPage,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
  ) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: palette.boxBg,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawRectangle({
      x,
      y: y + h - 16,
      width: w,
      height: 16,
      color: palette.headerBg,
    });
    page.drawText(toPdfSafeText(title.toUpperCase()), {
      x: x + 6,
      y: y + h - 12,
      size: 8,
      font: fontBold,
      color: palette.headerText,
    });
  };

  const addTextField = (
    page: PDFPage,
    name: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize = 9,
    multiline = false,
  ) => {
    const field = form.createTextField(name);
    if (multiline) field.enableMultiline();
    field.setText(toPdfSafeText(value));
    field.addToPage(page, {
      x,
      y,
      width: w,
      height: h,
      textColor: palette.text,
      backgroundColor: rgb(1, 1, 1),
      borderColor: palette.border,
      borderWidth: 0.6,
      font: fontRegular,
    });
    field.setFontSize(fontSize);
    return field;
  };

  const addCheckBox = (
    page: PDFPage,
    name: string,
    checked: boolean,
    x: number,
    y: number,
    size = 9,
  ) => {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, {
      x,
      y,
      width: size,
      height: size,
      backgroundColor: rgb(1, 1, 1),
      borderColor: palette.border,
      borderWidth: 0.7,
    });
    if (checked) cb.check();
    return cb;
  };

  const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  // =========================================================================
  // PAGE 1 — Core Character & Combat Sheet
  // =========================================================================
  const page1 = pdfDoc.addPage([612, 792]);
  drawPageBackground(page1, 'Core Character & Combat Sheet', 1);

  // Header Banner (y: 704..766)
  page1.drawRectangle({
    x: 26,
    y: 704,
    width: 560,
    height: 62,
    color: palette.boxBg,
    borderColor: palette.border,
    borderWidth: 1.2,
  });
  page1.drawText('CHARACTER NAME', {
    x: 34,
    y: 754,
    size: 7,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(page1, 'pc_name', pc.name || 'Unnamed Adventurer', 34, 730, 190, 22, 12);

  const classSummary =
    pc.classes.length > 0
      ? pc.classes
          .map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`)
          .join(' / ')
      : `Adventurer ${pc.level}`;

  page1.drawText('CLASS & SUBCLASS', {
    x: 232,
    y: 754,
    size: 7,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(page1, 'pc_class_level', classSummary, 232, 734, 175, 18, 9);

  page1.drawText('LEVEL', {
    x: 414,
    y: 754,
    size: 7,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(page1, 'pc_level', String(pc.level), 414, 734, 38, 18, 10);

  page1.drawText('SPECIES / ANCESTRY', {
    x: 458,
    y: 754,
    size: 7,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(page1, 'pc_species', pc.race || '-', 458, 734, 120, 18, 9);

  page1.drawText('BACKGROUND', {
    x: 232,
    y: 722,
    size: 6.5,
    font: fontBold,
    color: palette.muted,
  });
  addTextField(page1, 'pc_background', pc.background || '-', 288, 710, 130, 16, 8.5);

  page1.drawText('ALIGNMENT', {
    x: 426,
    y: 722,
    size: 6.5,
    font: fontBold,
    color: palette.muted,
  });
  addTextField(page1, 'pc_alignment', pc.alignment || '-', 476, 710, 102, 16, 8.5);

  // Left Column: 6 Ability Score Boxes (x: 26, y: 316..696, width: 76)
  ABILITY_NAMES.forEach((ab, idx) => {
    const boxY = 636 - idx * 62;
    const score = pc.abilities[ab] ?? 10;
    const mod = abilityMod(score);

    page1.drawRectangle({
      x: 26,
      y: boxY,
      width: 76,
      height: 56,
      color: palette.boxBg,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page1.drawRectangle({
      x: 26,
      y: boxY + 42,
      width: 76,
      height: 14,
      color: palette.headerBg,
    });
    page1.drawText(ab, {
      x: 54,
      y: boxY + 45,
      size: 8.5,
      font: fontBold,
      color: palette.headerText,
    });

    page1.drawText('Score', {
      x: 31,
      y: boxY + 26,
      size: 6.5,
      font: fontRegular,
      color: palette.muted,
    });
    addTextField(page1, `ab_${ab}`, String(score), 54, boxY + 22, 42, 16, 9);

    page1.drawText('Mod', {
      x: 31,
      y: boxY + 8,
      size: 6.5,
      font: fontBold,
      color: palette.accent,
    });
    addTextField(page1, `mod_${ab}`, fmtMod(mod), 54, boxY + 4, 42, 15, 9);
  });

  // Left Bottom: Proficiency Bonus, Inspiration & Passive Senses (x: 26, y: 170..314)
  drawSectionBox(page1, 26, 170, 176, 146, 'Proficiency & Passive Senses');
  page1.drawText('Proficiency Bonus:', {
    x: 34,
    y: 282,
    size: 8,
    font: fontBold,
    color: palette.text,
  });
  addTextField(page1, 'prof_bonus', fmtMod(pc.proficiencyBonus), 146, 278, 46, 15, 9);

  page1.drawText('Heroic Inspiration:', {
    x: 34,
    y: 262,
    size: 8,
    font: fontBold,
    color: palette.text,
  });
  addCheckBox(page1, 'inspiration', !!pc.inspiration, 160, 260, 12);

  const derived = evaluated.derivedStats;
  const passiveRows: Array<[string, string, number]> = [
    ['Passive Perception', 'passive_perception', derived.passivePerception],
    ['Passive Investigation', 'passive_investigation', derived.passiveInvestigation],
    ['Passive Insight', 'passive_insight', derived.passiveInsight],
  ];
  passiveRows.forEach(([label, fieldName, val], i) => {
    const py = 236 - i * 20;
    page1.drawText(label, {
      x: 34,
      y: py,
      size: 7.5,
      font: fontRegular,
      color: palette.text,
    });
    addTextField(page1, fieldName, String(val), 152, py - 3, 40, 14, 8.5);
  });
  page1.drawText(
    toPdfSafeText(`Carrying Cap: ${derived.carryingCapacity} lbs`),
    {
      x: 34,
      y: 176,
      size: 7,
      font: fontRegular,
      color: palette.muted,
    },
  );

  // Column 2: Saving Throws & 18 Skills (x: 110, y: 324..692, width: 175)
  drawSectionBox(page1, 110, 584, 175, 108, 'Saving Throws');
  ABILITY_NAMES.forEach((ab, idx) => {
    const col = idx < 3 ? 0 : 1;
    const row = idx % 3;
    const sx = 116 + col * 84;
    const sy = 656 - row * 22;
    const isProf = pc.proficiencies.savingThrows.includes(ab);
    const saveBonus = savingThrowBonus(pc, ab);
    addCheckBox(page1, `save_prof_${ab}`, isProf, sx, sy, 8);
    page1.drawText(`${ab} ${fmtMod(saveBonus)}`, {
      x: sx + 12,
      y: sy + 1,
      size: 8,
      font: isProf ? fontBold : fontRegular,
      color: palette.text,
    });
  });

  drawSectionBox(page1, 110, 324, 175, 254, 'Skills (Prof / Exp)');
  ALL_SKILLS.forEach((skill: SkillName, idx: number) => {
    const sy = 550 - idx * 12.2;
    const ab = SKILL_ABILITIES[skill];
    const isProf = pc.proficiencies.skills.includes(skill);
    const isExp = (pc.skillExpertise ?? []).includes(skill);
    const baseMod = abilityMod(pc.abilities[ab]);
    const bonus = isExp
      ? baseMod + pc.proficiencyBonus * 2
      : isProf
        ? baseMod + pc.proficiencyBonus
        : baseMod;
    const tag = isExp ? '[E]' : isProf ? '[P]' : '[ ]';
    page1.drawText(
      toPdfSafeText(`${tag} ${fmtMod(bonus)}  ${skill} (${ab})`),
      {
        x: 116,
        y: sy,
        size: 7,
        font: isProf || isExp ? fontBold : fontRegular,
        color: palette.text,
      },
    );
  });

  // Right Area Top: Combat Vitals Block (x: 292, y: 540..692, width: 294)
  drawSectionBox(page1, 292, 540, 294, 152, 'Combat Vitals & Status');

  // Row 1: AC, Initiative, Speed
  page1.drawText('ARMOR CLASS', { x: 300, y: 664, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'ac', String(pc.ac), 300, 644, 52, 18, 11);

  page1.drawText('INITIATIVE', { x: 368, y: 664, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'initiative', fmtMod(pc.initiativeMod), 368, 644, 52, 18, 11);

  page1.drawText('SPEED (FT)', { x: 436, y: 664, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'speed', `${pc.speed} ft`, 436, 644, 60, 18, 10);

  page1.drawText('EXHAUSTION', { x: 508, y: 664, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'exhaustion', String(pc.exhaustion || 0), 508, 644, 68, 18, 10);

  // Row 2: Current HP, Max HP, Temp HP, Hit Dice
  page1.drawText('CURRENT HP', { x: 300, y: 628, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'hp_current', String(pc.hp.current), 300, 606, 64, 20, 11);

  page1.drawText('MAX HP', { x: 372, y: 628, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'hp_max', String(pc.hp.max), 372, 606, 64, 20, 11);

  page1.drawText('TEMP HP', { x: 444, y: 628, size: 7, font: fontBold, color: palette.accent });
  addTextField(page1, 'hp_temp', String(pc.hp.temp || 0), 444, 606, 52, 20, 10);

  const hdAvail = Math.max(0, pc.hitDice.max - (pc.hitDice.used || 0));
  page1.drawText('HIT DICE', { x: 504, y: 628, size: 7, font: fontBold, color: palette.accent });
  addTextField(
    page1,
    'hit_dice',
    `${hdAvail}/${pc.hitDice.max} d${pc.hitDice.dieSize}`,
    504,
    606,
    74,
    20,
    8.5,
  );

  // Row 3: Death Saves & Active Conditions
  page1.drawText('Death Saves:', { x: 300, y: 590, size: 7.5, font: fontBold, color: palette.text });
  page1.drawText('Succ', { x: 300, y: 576, size: 6.5, font: fontRegular, color: palette.muted });
  for (let i = 0; i < 3; i++) {
    addCheckBox(
      page1,
      `ds_succ_${i + 1}`,
      (pc.deathSaves.successes || 0) > i,
      324 + i * 12,
      575,
      8,
    );
  }
  page1.drawText('Fail', { x: 368, y: 576, size: 6.5, font: fontRegular, color: palette.muted });
  for (let i = 0; i < 3; i++) {
    addCheckBox(
      page1,
      `ds_fail_${i + 1}`,
      (pc.deathSaves.failures || 0) > i,
      388 + i * 12,
      575,
      8,
    );
  }

  page1.drawText('Active Conditions:', {
    x: 300,
    y: 558,
    size: 7.5,
    font: fontBold,
    color: palette.text,
  });
  addTextField(
    page1,
    'conditions',
    pc.conditions.length > 0 ? pc.conditions.join(', ') : 'None',
    380,
    546,
    198,
    18,
    8.5,
  );

  // Attacks & Weapons Table (x: 292, y: 404..532, width: 294)
  drawSectionBox(page1, 292, 404, 294, 128, 'Attacks & Weapons');
  page1.drawText('NAME', { x: 298, y: 506, size: 6.5, font: fontBold, color: palette.muted });
  page1.drawText('ATK', { x: 406, y: 506, size: 6.5, font: fontBold, color: palette.muted });
  page1.drawText('DAMAGE / TYPE', { x: 444, y: 506, size: 6.5, font: fontBold, color: palette.muted });
  page1.drawText('RANGE', { x: 534, y: 506, size: 6.5, font: fontBold, color: palette.muted });

  const attacksToRender = pc.attacks.slice(0, 5);
  attacksToRender.forEach((atk, idx) => {
    const ay = 490 - idx * 16;
    page1.drawText(toPdfSafeText(atk.name.slice(0, 22)), {
      x: 298,
      y: ay,
      size: 7.5,
      font: fontBold,
      color: palette.text,
    });
    page1.drawText(fmtMod(atk.attackBonus), {
      x: 406,
      y: ay,
      size: 7.5,
      font: fontRegular,
      color: palette.text,
    });
    page1.drawText(toPdfSafeText(`${atk.damageExpr} ${atk.damageType}`.trim().slice(0, 18)), {
      x: 444,
      y: ay,
      size: 7.5,
      font: fontRegular,
      color: palette.text,
    });
    page1.drawText(toPdfSafeText((atk.range || '5 ft.').slice(0, 10)), {
      x: 534,
      y: ay,
      size: 7,
      font: fontRegular,
      color: palette.muted,
    });
  });

  // Class Resource Pools (x: 292, y: 274..396, width: 294)
  drawSectionBox(page1, 292, 274, 294, 122, 'Class Resource Pools');
  const pools = pc.resourcePools ?? [];
  pools.slice(0, 6).forEach((pool, idx) => {
    const py = 366 - idx * 15;
    const badge = `[${pool.current} / ${pool.max}] (${pool.rechargeOn})`;
    page1.drawText(toPdfSafeText(`${pool.name}: ${badge}`), {
      x: 300,
      y: py,
      size: 7.5,
      font: fontBold,
      color: palette.text,
    });
  });

  // Equipment, Attunement & Coin Purse (x: 26..586, y: 38..164)
  drawSectionBox(page1, 26, 38, 396, 126, 'Equipment & Attunement (Max 3)');
  page1.drawText('Attuned Slots:', { x: 34, y: 136, size: 7.5, font: fontBold, color: palette.accent });
  const attunedItems = pc.inventory.filter((i) => i.attuned);
  const attunedTotal = Math.max(attunedItems.length, pc.attunedCount || 0);
  for (let i = 0; i < 3; i++) {
    addCheckBox(page1, `attune_${i + 1}`, i < attunedTotal, 102 + i * 95, 134, 9);
    const itemLabel = attunedItems[i]?.name
      ? attunedItems[i].name.slice(0, 14)
      : `Slot ${i + 1}`;
    page1.drawText(toPdfSafeText(itemLabel), {
      x: 114 + i * 95,
      y: 135,
      size: 7,
      font: fontRegular,
      color: palette.text,
    });
  }

  const equipLines = pc.inventory
    .map(
      (it) =>
        `${it.qty > 1 ? `${it.qty}x ` : ''}${it.name}${it.equipped ? ' [E]' : ''}${it.attuned ? ' [A]' : ''}`,
    )
    .join(', ');
  addTextField(page1, 'equipment_text', equipLines || 'No equipment listed', 34, 44, 380, 84, 8, true);

  // Coin Purse Box (x: 430, y: 38..266, width: 156)
  drawSectionBox(page1, 430, 38, 156, 228, 'Coin Purse');
  const coins: Array<[keyof NonNullable<PlayerCharacter['currency']>, string]> = [
    ['cp', 'Copper (CP)'],
    ['sp', 'Silver (SP)'],
    ['ep', 'Electrum (EP)'],
    ['gp', 'Gold (GP)'],
    ['pp', 'Platinum (PP)'],
  ];
  const purse = pc.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  coins.forEach(([coinKey, label], idx) => {
    const cy = 224 - idx * 34;
    page1.drawText(label, { x: 438, y: cy + 4, size: 8, font: fontBold, color: palette.text });
    addTextField(page1, `coin_${coinKey}`, String(purse[coinKey] ?? 0), 520, cy, 56, 18, 9);
  });

  // =========================================================================
  // PAGE 2 — Spellcasting, Features & Tactical Profile
  // =========================================================================
  const page2 = pdfDoc.addPage([612, 792]);
  drawPageBackground(page2, 'Spellcasting, Features & Tactical Profile', 2);

  // Spellcasting Header Box (x: 26, y: 696..766, width: 560)
  drawSectionBox(page2, 26, 696, 560, 70, 'Spellcasting Header & Save DC');
  page2.drawText('SPELLCASTING ABILITY', {
    x: 36,
    y: 736,
    size: 7.5,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(
    page2,
    'spell_ability',
    pc.spellcastingAbility || 'None',
    36,
    708,
    130,
    22,
    10,
  );

  page2.drawText('SPELL SAVE DC', {
    x: 204,
    y: 736,
    size: 7.5,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(
    page2,
    'spell_dc',
    derived.spellSaveDc !== null ? String(derived.spellSaveDc) : '-',
    204,
    708,
    130,
    22,
    11,
  );

  page2.drawText('SPELL ATTACK BONUS', {
    x: 372,
    y: 736,
    size: 7.5,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(
    page2,
    'spell_atk',
    derived.spellAttackBonus !== null ? fmtMod(derived.spellAttackBonus) : '-',
    372,
    708,
    130,
    22,
    11,
  );

  // Spell Slots & Spells Known (x: 26, y: 416..686, width: 560)
  drawSectionBox(page2, 26, 416, 560, 270, 'Spell Slot Trackers (Levels 1-9 & Pact Magic) & Spells');
  SPELL_SLOT_LEVELS.forEach((lvl, idx) => {
    const col = idx < 5 ? 0 : 1;
    const row = idx % 5;
    const sx = 34 + col * 135;
    const sy = 650 - row * 22;
    const slot = pc.spellSlots?.[lvl] as ({ max: number; used: number; current?: number } | undefined);
    const max = slot?.max ?? 0;
    const avail =
      slot?.current !== undefined ? slot.current : Math.max(0, max - (slot?.used ?? 0));
    page2.drawText(`Lv ${lvl}:`, {
      x: sx,
      y: sy + 3,
      size: 8,
      font: fontBold,
      color: palette.text,
    });
    addTextField(page2, `slot_${lvl}`, `${avail}/${max}`, sx + 30, sy, 46, 15, 8.5);
  });

  // Pact Magic Tracker
  const pact = pc.pactSlots as ({ level: SpellSlotLevel; max: number; used: number; current?: number } | null | undefined);
  const pactMax = pact?.max ?? 0;
  const pactAvail =
    pact?.current !== undefined ? pact.current : Math.max(0, pactMax - (pact?.used ?? 0));
  page2.drawText('Pact Magic:', {
    x: 169,
    y: 565,
    size: 8,
    font: fontBold,
    color: palette.accent,
  });
  addTextField(
    page2,
    'slot_pact',
    pactMax > 0 ? `${pactAvail}/${pactMax} (Lv ${pact?.level ?? 1})` : '0/0',
    222,
    562,
    72,
    15,
    8,
  );

  // Spells Known list field
  page2.drawText('Prepared & Known Spells:', {
    x: 310,
    y: 656,
    size: 8,
    font: fontBold,
    color: palette.accent,
  });
  const spellsText = (pc.spellsKnown ?? []).join(', ') || 'No spells recorded';
  addTextField(page2, 'spells_known', spellsText, 310, 426, 266, 224, 8.5, true);

  // Features, Traits & Proficiencies (x: 26, y: 166..406, width: 560)
  drawSectionBox(page2, 26, 166, 350, 240, 'Class Features & Racial Traits');
  const featuresText = pc.features
    .map(
      (f) =>
        `${f.name}${f.source ? ` (${f.source})` : ''}: ${f.description}`,
    )
    .join('\n\n');
  addTextField(
    page2,
    'features_text',
    featuresText || 'No class features recorded',
    34,
    174,
    334,
    210,
    8,
    true,
  );

  drawSectionBox(page2, 384, 166, 202, 240, 'Proficiencies & Languages');
  const profText = [
    `Languages: ${(pc.proficiencies.languages ?? []).join(', ') || 'Common'}`,
    `Armor: ${(pc.proficiencies.armor ?? []).join(', ') || 'None'}`,
    `Weapons: ${(pc.proficiencies.weapons ?? []).join(', ') || 'None'}`,
    `Tools: ${(pc.proficiencies.tools ?? []).join(', ') || 'None'}`,
  ].join('\n\n');
  addTextField(page2, 'proficiencies_text', profText, 392, 174, 186, 210, 8, true);

  // Tactical Evaluation Footer on Page 2 (x: 26, y: 38..156, width: 560)
  if (options.includeTacticalEvaluation !== false && pc.evaluation) {
    drawSectionBox(page2, 26, 38, 560, 118, 'Tactical & Mechanical Evaluation');
    const ev = pc.evaluation;
    page2.drawText(
      toPdfSafeText(`Party Roles: ${ev.partyRoles.join(', ') || 'Generalist'}`),
      { x: 34, y: 126, size: 8.5, font: fontBold, color: palette.accent },
    );
    page2.drawText(
      toPdfSafeText(
        `Defense: ${ev.defensiveProfile.acSummary}  |  Strongest Saves: ${ev.defensiveProfile.strongestSaves.join(', ')}  |  Weakest Saves: ${ev.defensiveProfile.weakestSaves.join(', ')}`,
      ),
      { x: 34, y: 110, size: 7.5, font: fontRegular, color: palette.text },
    );
    page2.drawText(
      toPdfSafeText(
        `Resistances: ${ev.defensiveProfile.resistances.join(', ') || 'None'}  |  Immunities: ${ev.defensiveProfile.immunities.join(', ') || 'None'}  |  Senses: ${ev.defensiveProfile.specialSenses.join(', ') || 'Normal'}`,
      ),
      { x: 34, y: 94, size: 7.5, font: fontRegular, color: palette.text },
    );
    if (ev.auditNotes.length > 0) {
      const auditSummary = ev.auditNotes.map((a) => `[${a.category}] ${a.message}`).join('  *  ');
      page2.drawText(toPdfSafeText(`Audit Notes: ${auditSummary.slice(0, 125)}`), {
        x: 34,
        y: 76,
        size: 7,
        font: fontRegular,
        color: palette.muted,
      });
    }
  }

  // =========================================================================
  // PAGE 3 (Optional) — Quests, Backstory & Session Notes
  // =========================================================================
  const hasNotesContent =
    Boolean(pc.notes?.trim()) ||
    Boolean(pc.backstory?.trim()) ||
    Boolean(pc.privateNotes?.trim()) ||
    Boolean(pc.gmNotes?.trim()) ||
    (pc.gmSecrets?.length ?? 0) > 0 ||
    (pc.sharedQuests?.length ?? 0) > 0 ||
    (pc.sharedJournal?.length ?? 0) > 0 ||
    pc.goals.length > 0 ||
    pc.bonds.length > 0 ||
    pc.ideals.length > 0 ||
    pc.flaws.length > 0;

  const shouldRenderPage3 =
    options.includeNotesPage === true ||
    (options.includeNotesPage !== false && hasNotesContent);

  if (shouldRenderPage3) {
    const page3 = pdfDoc.addPage([612, 792]);
    drawPageBackground(page3, 'Quests, Backstory & Session Notes', 3);

    drawSectionBox(page3, 26, 520, 560, 246, 'Roleplay Traits, Goals & Quests');
    const questLines = (pc.sharedQuests ?? []).map(
      (q) => `[${q.status.toUpperCase()}] ${q.title}: ${q.notes}`,
    );
    const traitsAndQuestsText = [
      pc.goals.length ? `Goals: ${pc.goals.join('; ')}` : '',
      pc.ideals.length ? `Ideals: ${pc.ideals.join('; ')}` : '',
      pc.bonds.length ? `Bonds: ${pc.bonds.join('; ')}` : '',
      pc.flaws.length ? `Flaws: ${pc.flaws.join('; ')}` : '',
      questLines.length ? `Quests:\n${questLines.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    addTextField(
      page3,
      'quests_and_traits_text',
      traitsAndQuestsText || 'No active quests or traits recorded.',
      34,
      528,
      544,
      216,
      8.5,
      true,
    );

    drawSectionBox(page3, 26, 38, 560, 470, 'Backstory, Session Journal & Character Notes');
    const journalLines = (pc.sharedJournal ?? []).map(
      (j) => `Session ${j.sessionNumber} (${j.date}) - ${j.title}: ${j.content}`,
    );
    const combinedNotes = [
      pc.backstory ? `Backstory:\n${pc.backstory}` : '',
      pc.notes ? `Session Notes:\n${pc.notes}` : '',
      pc.privateNotes ? `Personal Notes:\n${pc.privateNotes}` : '',
      journalLines.length ? `Journal:\n${journalLines.join('\n\n')}` : '',
      options.mode === 'gm' && options.includeGmSecrets && pc.gmNotes
        ? `GM-Only Notes:\n${pc.gmNotes}`
        : '',
      options.mode === 'gm' && options.includeGmSecrets && pc.gmSecrets?.length
        ? `GM Secrets:\n${Array.isArray(pc.gmSecrets) ? pc.gmSecrets.join('\n') : pc.gmSecrets}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    addTextField(
      page3,
      'notes_text',
      combinedNotes || 'No additional notes.',
      34,
      46,
      544,
      440,
      8.5,
      true,
    );
  }

  const bytes = await pdfDoc.save();
  return Object.assign(bytes, {
    bytes,
    filename,
    redactedPc: pc,
  });
}

/**
 * Browser helper that exports the Character Sheet PDF and triggers a download
 * (or invokes the native mobile Web Share API on Android/iOS when `preferShare` is set).
 */
export async function downloadOrShareCharacterSheetPdf(
  pc: Partial<PlayerCharacter> & Record<string, unknown>,
  options: CharacterPdfExportOptions & { preferShare?: boolean } = {},
): Promise<CharacterPdfExportResult> {
  const result = await exportCharacterSheetPdf(pc, options);
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return result;
  }

  const blob = new Blob([result.bytes as unknown as BlobPart], { type: 'application/pdf' });
  if (
    options.preferShare &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof File !== 'undefined'
  ) {
    try {
      const file = new File([blob], result.filename, { type: 'application/pdf' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: result.filename,
          files: [file],
        });
        return result;
      }
    } catch {
      // Fall back to direct file download if user cancels or share fails
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  return result;
}
