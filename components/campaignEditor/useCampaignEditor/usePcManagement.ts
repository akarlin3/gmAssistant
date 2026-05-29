'use client';

import { type Character } from '@/lib/character-schema';
import { type PlayerCharacter, PC_CAP } from '@/lib/pc/types';
import { emptyPc, capPcs } from '@/lib/pc/factory';
import { syncAttackMacros, dropPcMacros, type PcMacros } from '@/lib/pc/macros';
import { mapParsedToPc } from '@/lib/pc/from-parser';
import { uploadCharacterSheet as doUploadCharacterSheet, uploadPcSheet as doUploadPcSheet } from './useSheetUpload';

/** Returns all PC CRUD helpers bound to the current state/setState. */
export function buildPcManagement(
  pcs: PlayerCharacter[],
  characters: Character[],
  pcMacros: PcMacros,
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  setOpenPcs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  setOpenChars: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  setCharUploadError: (v: string) => void,
  setUploadingChar: (v: boolean) => void,
  setPcUploadError: (v: string) => void,
  setUploadingPc: (v: boolean) => void,
  showUndoToast: (msg: string, ms?: number) => void,
  setVal: (k: string, v: any) => void,
) {
  const writePcs = (next: PlayerCharacter[], nextMacros?: PcMacros) => {
    setState((s) => ({ ...s, pcs: capPcs(next), ...(nextMacros ? { pcMacros: nextMacros } : {}) }));
  };

  const addPc = () => {
    if (pcs.length >= PC_CAP) return;
    const fresh = emptyPc();
    writePcs([...pcs, fresh]);
    setOpenPcs((o) => ({ ...o, [fresh.id]: true }));
  };

  const updatePc = (pc: PlayerCharacter) => {
    writePcs(pcs.map((p) => (p.id === pc.id ? pc : p)), syncAttackMacros(pc, pcMacros));
  };

  const removePc = (id: string) => {
    const target = pcs.find((p) => p.id === id);
    writePcs(pcs.filter((p) => p.id !== id), dropPcMacros(id, pcMacros));
    setOpenPcs((o) => { const n = { ...o }; delete n[id]; return n; });
    showUndoToast(`Deleted "${target?.name || 'PC'}" — Press ⌘Z to undo`, 5000);
  };

  const addCharacter = () => addPc();

  const updateCharacter = (id: string, patch: Character) => {
    const updatedPc = mapParsedToPc(patch);
    const originalPc = pcs.find(p => p.id === id);
    if (originalPc) {
      updatedPc.ownership = originalPc.ownership;
      updatedPc.goals = originalPc.goals;
      updatedPc.bonds = originalPc.bonds;
      updatedPc.ideals = originalPc.ideals;
      updatedPc.flaws = originalPc.flaws;
    }
    updatePc(updatedPc);
  };

  const removeCharacter = (id: string) => removePc(id);

  const uploadCharacterSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await doUploadCharacterSheet(e, characters, setCharUploadError, setUploadingChar, (fresh) => {
      setVal('characters', [...characters, fresh]);
      setOpenChars(o => ({ ...o, [fresh.id]: true }));
    });
  };

  const uploadPcSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await doUploadPcSheet(e, pcs, pcMacros, setPcUploadError, setUploadingPc, writePcs, setOpenPcs);
  };

  return { writePcs, addPc, updatePc, removePc, addCharacter, updateCharacter, removeCharacter, uploadCharacterSheet, uploadPcSheet };
}
