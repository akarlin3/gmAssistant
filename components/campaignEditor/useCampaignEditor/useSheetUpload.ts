'use client';

import React from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { normalizeCharacter, makeCharacterId, type Character } from '@/lib/character-schema';
import { syncAttackMacros } from '@/lib/pc/macros';
import type { PlayerCharacter } from '@/lib/pc/types';
import type { PcMacros } from '@/lib/pc/macros';
import { PC_CAP } from '@/lib/pc/types';
import { parseCharacterSheet } from '@/lib/characterSheetParser';
import { mapPcToLegacyCharacter } from '../mapPcToLegacyCharacter';

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
    let idToken: string | undefined;
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) idToken = await user.getIdToken();
    } catch {
      // Allow offline Tier 1 parsing even without Firebase auth
    }
    const parsedResult = await parseCharacterSheet(file, {
      filename: file.name,
      mimeType: file.type,
      authToken: idToken,
    });
    const legacy = normalizeCharacter(mapPcToLegacyCharacter(parsedResult.pc));
    const fresh: Character = { ...legacy, id: makeCharacterId() };
    onSuccess(fresh);
  } catch (err: any) {
    setCharUploadError(err?.message || 'Upload failed');
  } finally {
    setUploadingChar(false);
  }
}

/** Upload one or more PC sheets (batch party upload supported), evaluate, state-preserving merge, and save. */
export async function uploadPcSheet(
  e: React.ChangeEvent<HTMLInputElement>,
  pcs: PlayerCharacter[],
  pcMacros: PcMacros,
  setPcUploadError: (v: string) => void,
  setUploadingPc: (v: boolean) => void,
  writePcs: (next: PlayerCharacter[], macros?: PcMacros) => void,
  setOpenPcs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
) {
  const fileList = e.target.files ? Array.from(e.target.files) : [];
  e.target.value = '';
  if (fileList.length === 0) return;
  setPcUploadError('');
  setUploadingPc(true);
  try {
    let idToken: string | undefined;
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) idToken = await user.getIdToken();
    } catch {
      // Allow offline Tier 1 parsing
    }

    let workingPcs = [...pcs];
    let workingMacros = { ...pcMacros };
    const newlyOpened: Record<string, boolean> = {};

    for (const file of fileList) {
      const result = await parseCharacterSheet(file, {
        filename: file.name,
        mimeType: file.type,
        existingPcs: workingPcs,
        authToken: idToken,
      });
      const pc = result.pc;
      if (result.mergedWithExisting && result.matchedPcId) {
        workingPcs = workingPcs.map((p) => (p.id === result.matchedPcId ? pc : p));
      } else {
        if (workingPcs.length >= PC_CAP) {
          setPcUploadError(`Party cap (${PC_CAP}) reached; some new sheets were skipped.`);
          break;
        }
        workingPcs.push(pc);
      }
      workingMacros = syncAttackMacros(pc, workingMacros);
      newlyOpened[pc.id] = true;
    }

    writePcs(workingPcs, workingMacros);
    setOpenPcs((o) => ({ ...o, ...newlyOpened }));
  } catch (err: any) {
    setPcUploadError(err?.message || 'Upload failed');
  } finally {
    setUploadingPc(false);
  }
}
