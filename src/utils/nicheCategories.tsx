import React from 'react';
import { NicheCategoryPreset } from '../types/index.ts';

export interface NicheVisualMeta {
  category: string;
  badgeKey: string;
  label: string;
  badgeClass: string;
  dotClass: string;
  borderClass: string;
  bgLightClass: string;
  description?: string;
}

export const NICHE_PRESETS: Array<{
  category: string;
  badgeKey: string;
  label: string;
  badgeClass: string;
  dotClass: string;
  borderClass: string;
  bgLightClass: string;
  description: string;
}> = [
  {
    category: 'Ayam Warna Warni',
    badgeKey: 'amber',
    label: 'Ayam Warna Warni',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
    dotClass: 'bg-amber-400',
    borderClass: 'border-amber-800/50 hover:border-amber-700',
    bgLightClass: 'from-amber-950/20 to-neutral-900/40',
    description: 'Anak ayam warna-warni & suara peternakan ceria',
  },
  {
    category: 'ASMR',
    badgeKey: 'purple',
    label: 'ASMR & Suara Alam',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
    dotClass: 'bg-purple-400',
    borderClass: 'border-purple-800/50 hover:border-purple-700',
    bgLightClass: 'from-purple-950/20 to-neutral-900/40',
    description: 'Bisikan binaural, ketukan tetesan hujan, dan relaksasi',
  },
  {
    category: 'Music',
    badgeKey: 'cyan',
    label: 'Musik & Ambience',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60',
    dotClass: 'bg-cyan-400',
    borderClass: 'border-cyan-800/50 hover:border-cyan-700',
    bgLightClass: 'from-cyan-950/20 to-neutral-900/40',
    description: 'Irama lo-fi santai, gelombang tidur & alunan instrumental',
  },
  {
    category: 'Murottal',
    badgeKey: 'emerald',
    label: 'Murottal Al-Qur\'an',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
    dotClass: 'bg-emerald-400',
    borderClass: 'border-emerald-800/50 hover:border-emerald-700',
    bgLightClass: 'from-emerald-950/20 to-neutral-900/40',
    description: 'Lantunan merdu 30 Juz, terjemahan & bacaan Al-Qur\'an penenang tidur',
  },
];

export function getNicheMeta(category?: string | null, badgeKey?: string | null): NicheVisualMeta {
  const normCategory = (category || 'General').trim();
  const matched = NICHE_PRESETS.find(
    (p) => p.category.toLowerCase() === normCategory.toLowerCase()
  );

  if (matched) {
    return matched;
  }

  // Fallback or custom niche
  const bKey = badgeKey || 'rose';
  let badgeClass = 'bg-rose-950/80 text-rose-300 border-rose-800/60';
  let dotClass = 'bg-rose-400';
  let borderClass = 'border-rose-800/50 hover:border-rose-700';
  let bgLightClass = 'from-rose-950/20 to-neutral-900/40';

  if (bKey === 'blue' || bKey === 'cyan') {
    badgeClass = 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60';
    dotClass = 'bg-cyan-400';
    borderClass = 'border-cyan-800/50 hover:border-cyan-700';
    bgLightClass = 'from-cyan-950/20 to-neutral-900/40';
  } else if (bKey === 'emerald' || bKey === 'green') {
    badgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
    dotClass = 'bg-emerald-400';
    borderClass = 'border-emerald-800/50 hover:border-emerald-700';
    bgLightClass = 'from-emerald-950/20 to-neutral-900/40';
  } else if (bKey === 'purple' || bKey === 'indigo') {
    badgeClass = 'bg-purple-950/80 text-purple-300 border-purple-800/60';
    dotClass = 'bg-purple-400';
    borderClass = 'border-purple-800/50 hover:border-purple-700';
    bgLightClass = 'from-purple-950/20 to-neutral-900/40';
  } else if (bKey === 'amber' || bKey === 'yellow') {
    badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-800/60';
    dotClass = 'bg-amber-400';
    borderClass = 'border-amber-800/50 hover:border-amber-700';
    bgLightClass = 'from-amber-950/20 to-neutral-900/40';
  }

  return {
    category: normCategory,
    badgeKey: bKey,
    label: normCategory,
    badgeClass,
    dotClass,
    borderClass,
    bgLightClass,
  };
}

export const NicheBadge: React.FC<{
  category?: string;
  badgeKey?: string;
  className?: string;
  showDot?: boolean;
}> = ({ category, badgeKey, className = '', showDot = true }) => {
  const meta = getNicheMeta(category, badgeKey);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide border shadow-sm ${meta.badgeClass} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />}
      <span>{meta.label}</span>
    </span>
  );
};
