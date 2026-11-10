'use client';

import React from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { makeCharacterId, type Character } from '@/lib/character-schema';
import { parseCharacterSheetFile } from '@/lib/characterSheetParser';
import { findMatchingPc, mergeUploadedCharacterSheet } from '@/lib/characterMerge';
import { syncAttackMacros } from '@/lib/pc/macros';
import type { PlayerCharacter } from '@/lib/pc/types';
import type { PcMacros } from '@/lib/pc/macros';
import { PC_CAP } from '@/lib/pc/types';
import { mapPcToLegacyCharacter } from '../mapPcToLegacyCharacter';

async function resolveOptionalIdToken(): Promise<string | undefined> {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return undefined;
    return await user.getIdToken();
  } catch {
    return undefined;
  }
}

export type BatchSheetUploadOutcome = {
  previousPcs: PlayerCharacter[];
  previousMacros: PcMacros;
  nextPcs: PlayerCharacter[];
  evaluatedPcs: PlayerCharacter[];
  uploadedPcs: PlayerCharacter[];
  mergedCount: number;
  createdCount: number;
};

/**
 * Parse, evaluate, and delta-merge one or more uploaded character sheet files
 * (.pdf, .json, .png, .jpg, .jpeg, .webp) into the campaign's PC roster.
 */
export async function uploadAndMergePcFiles(
  files: File[],
  pcs: PlayerCharacter[],
  pcMacros: PcMacros = {},
  writePcs?: (next: PlayerCharacter[], macros?: PcMacros) => void,
  setOpenPcs?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  options?: {
    targetPcId?: string;
    targetSlotId?: string;
    shareToken?: string;
  },
): Promise<BatchSheetUploadOutcome> {
  const previousPcs = [...pcs];
  const previousMacros = { ...pcMacros };
  let workingPcs = [...pcs];
  let workingMacros = { ...pcMacros };
  const evaluatedPcs: PlayerCharacter[] = [];
  let mergedCount = 0;
  let createdCount = 0;

  const idToken = await resolveOptionalIdToken();

  for (const file of files) {
    const { pc: parsedPc, isFullStateBackup } = await parseCharacterSheetFile(file, {
      idToken,
      shareToken: options?.shareToken,
    });

    const match = findMatchingPc(
      workingPcs,
      parsedPc,
      files.length === 1 ? options?.targetPcId : undefined,
      files.length === 1 ? options?.targetSlotId : undefined,
    );

    if (match) {
      const merged = mergeUploadedCharacterSheet(match, parsedPc, {
        isFullStateBackup,
      });
      workingPcs = workingPcs.map((p) => (p.id === match.id ? merged : p));
      workingMacros = syncAttackMacros(merged, workingMacros);
      evaluatedPcs.push(merged);
      mergedCount++;
      setOpenPcs?.((o) => ({ ...o, [merged.id]: true }));
    } else {
      if (workingPcs.length >= PC_CAP) {
        if (files.length === 1) {
          throw new Error(`Party is full (${PC_CAP} max)`);
        }
        continue;
      }
      const freshPc: PlayerCharacter = {
        ...parsedPc,
        ...(options?.targetSlotId
          ? { ownership: { ownerType: 'player', playerSlotId: options.targetSlotId } }
          : {}),
      };
      workingPcs = [...workingPcs, freshPc];
      workingMacros = syncAttackMacros(freshPc, workingMacros);
      evaluatedPcs.push(freshPc);
      createdCount++;
      setOpenPcs?.((o) => ({ ...o, [freshPc.id]: true }));
    }
  }

  writePcs?.(workingPcs, workingMacros);

  return {
    previousPcs,
    previousMacros,
    nextPcs: workingPcs,
    evaluatedPcs,
    uploadedPcs: evaluatedPcs,
    mergedCount,
    createdCount,
  };
}

/** Upload a legacy character sheet and append it to the characters list. */
export async function uploadCharacterSheet(
  e: React.ChangeEvent<HTMLInputElement>,
  characters: Character[],
  setCharUploadError: (v: string) => void,
  setUploadingChar: (v: boolean) => void,
  onSuccess: (fresh: Character) => void,
) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  setCharUploadError('');
  setUploadingChar(true);
  try {
    const idToken = await resolveOptionalIdToken();
    const { pc } = await parseCharacterSheetFile(file, { idToken });
    const legacy = mapPcToLegacyCharacter(pc);
    const fresh: Character = { ...legacy, id: makeCharacterId() };
    onSuccess(fresh);
  } catch (err: any) {
    setCharUploadError(err?.message || 'Upload failed');
  } finally {
    setUploadingChar(false);
  }
}

/** Upload one or more PC sheets and delta-merge or append them to the pcs list. */
export async function uploadPcSheet(
  e: React.ChangeEvent<HTMLInputElement>,
  pcs: PlayerCharacter[],
  pcMacros: PcMacros,
  setPcUploadError: (v: string) => void,
  setUploadingPc: (v: boolean) => void,
  writePcs: (next: PlayerCharacter[], macros?: PcMacros) => void,
  setOpenPcs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  onEvaluated?: (outcome: BatchSheetUploadOutcome) => void,
) {
  const fileList = e.target.files;
  const files = fileList ? Array.from(fileList) : [];
  e.target.value = '';
  if (files.length === 0) return;
  setPcUploadError('');
  setUploadingPc(true);
  try {
    const outcome = await uploadAndMergePcFiles(
      files,
      pcs,
      pcMacros,
      writePcs,
      setOpenPcs,
    );
    onEvaluated?.(outcome);
  } catch (err: any) {
    setPcUploadError(err?.message || 'Upload failed');
  } finally {
    setUploadingPc(false);
  }
}

