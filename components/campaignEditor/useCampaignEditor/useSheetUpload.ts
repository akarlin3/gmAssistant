'use client';

import React from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { normalizeCharacter, makeCharacterId, type Character } from '@/lib/character-schema';
import { mapParsedToPc } from '@/lib/pc/from-parser';
import { syncAttackMacros } from '@/lib/pc/macros';
import type { PlayerCharacter } from '@/lib/pc/types';
import type { PcMacros } from '@/lib/pc/macros';
import { PC_CAP } from '@/lib/pc/types';

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
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/parse-character-sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `Parse failed (${res.status})`);
    const parsed = normalizeCharacter(body.character);
    const fresh: Character = { ...parsed, id: makeCharacterId() };
    onSuccess(fresh);
  } catch (err: any) {
    setCharUploadError(err?.message || 'Upload failed');
  } finally {
    setUploadingChar(false);
  }
}

/** Upload a PC sheet and append it to the pcs list. */
export async function uploadPcSheet(
  e: React.ChangeEvent<HTMLInputElement>,
  pcs: PlayerCharacter[],
  pcMacros: PcMacros,
  setPcUploadError: (v: string) => void,
  setUploadingPc: (v: boolean) => void,
  writePcs: (next: PlayerCharacter[], macros?: PcMacros) => void,
  setOpenPcs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (pcs.length >= PC_CAP) { setPcUploadError(`Party is full (${PC_CAP} max)`); return; }
  setPcUploadError('');
  setUploadingPc(true);
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/parse-character-sheet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `Parse failed (${res.status})`);
    const parsed = normalizeCharacter(body.character);
    const pc = mapParsedToPc(parsed);
    writePcs([...pcs, pc], syncAttackMacros(pc, pcMacros));
    setOpenPcs((o) => ({ ...o, [pc.id]: true }));
  } catch (err: any) {
    setPcUploadError(err?.message || 'Upload failed');
  } finally {
    setUploadingPc(false);
  }
}
