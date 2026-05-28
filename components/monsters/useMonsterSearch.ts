import { useState, useEffect, useMemo } from 'react';
import type { Monster, HomebrewMonster } from './types';
import { CR_OPTIONS } from './constants';
import { pickRandom } from './format';

export type MonsterSearch = {
  /** SRD monsters loaded from /srd/monsters.json, or null while loading. */
  srdMonsters: Monster[] | null;
  loadError: string | null;
  /** Combined homebrew + SRD list, or null while SRD loads. */
  allMonsters: Monster[] | null;
  /** Monsters matching the active filters. */
  pool: Monster[];

  crMinIdx: number;
  crMaxIdx: number;
  types: Set<string>;
  hbOnly: boolean;
  picked: Monster | null;

  setCrMinIdx: (i: number) => void;
  setCrMaxIdx: (i: number) => void;
  setHbOnly: (v: boolean) => void;
  toggleType: (t: string) => void;
  clearFilters: () => void;
  roll: () => void;
  setPicked: (m: Monster | null) => void;
};

export function useMonsterSearch(homebrewMonsters: HomebrewMonster[]): MonsterSearch {
  const [srdMonsters, setSrdMonsters] = useState<Monster[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crMinIdx, setCrMinIdx] = useState(0);
  const [crMaxIdx, setCrMaxIdx] = useState(CR_OPTIONS.length - 1);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [hbOnly, setHbOnly] = useState(false);
  const [picked, setPicked] = useState<Monster | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/srd/monsters.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Monster[]) => {
        if (alive) setSrdMonsters(data);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const crMin = CR_OPTIONS[crMinIdx].value;
  const crMax = CR_OPTIONS[crMaxIdx].value;

  const allMonsters = useMemo<Monster[] | null>(() => {
    if (!srdMonsters) return null;
    return [...homebrewMonsters, ...srdMonsters];
  }, [srdMonsters, homebrewMonsters]);

  const pool = useMemo(() => {
    if (!allMonsters) return [];
    return allMonsters.filter((m) => {
      if (hbOnly && !m.homebrew) return false;
      if (m.cr < crMin || m.cr > crMax) return false;
      if (types.size && !types.has(m.type)) return false;
      return true;
    });
  }, [allMonsters, hbOnly, crMin, crMax, types]);

  const roll = () => {
    const next = pickRandom(pool, picked ?? undefined);
    if (next) {
      setPicked(next);
    }
  };

  const toggleType = (t: string) => {
    setTypes((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const clearFilters = () => {
    setCrMinIdx(0);
    setCrMaxIdx(CR_OPTIONS.length - 1);
    setTypes(new Set());
    setHbOnly(false);
  };

  return {
    srdMonsters,
    loadError,
    allMonsters,
    pool,
    crMinIdx,
    crMaxIdx,
    types,
    hbOnly,
    picked,
    setCrMinIdx,
    setCrMaxIdx,
    setHbOnly,
    toggleType,
    clearFilters,
    roll,
    setPicked,
  };
}
