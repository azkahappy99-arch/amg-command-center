import React from 'react';
import { DollarSign, TrendingUp, ShoppingBag, Radio, Users, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Channel, MonetizationStatus } from '../types/index';

/**
 * Format number to Indonesian Rupiah currency format.
 * Example: 26000000 -> "Rp 26.000.000"
 */
export function formatIDR(amount: number = 0): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format compact IDR (e.g. Rp 26 Jt)
 */
export function formatCompactIDR(amount: number = 0): string {
  if (amount >= 1_000_000_000) {
    return `Rp ${(amount / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (amount >= 1_000_000) {
    return `Rp ${(amount / 1_000_000).toFixed(1).replace('.', ',')} Jt`;
  }
  if (amount >= 1_000) {
    return `Rp ${(amount / 1_000).toFixed(0)} Rb`;
  }
  return `Rp ${amount}`;
}

/**
 * Component: Monetization Status Badge
 */
export const MonetizationBadge: React.FC<{
  status?: MonetizationStatus;
  subscribers?: number;
  watchHours?: number;
  className?: string;
  showDetails?: boolean;
}> = ({ status = 'NOT_MONETIZED', subscribers = 0, watchHours = 0, className = '', showDetails = true }) => {
  const SUB_GOAL = 1000;
  const WATCH_HOURS_GOAL = 4000;

  const subPercent = Math.min(100, Math.round((subscribers / SUB_GOAL) * 100));
  const watchPercent = Math.min(100, Math.round((watchHours / WATCH_HOURS_GOAL) * 100));
  const overallPercent = Math.round((subPercent + watchPercent) / 2);

  if (status === 'MONETIZED') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shadow-sm shadow-emerald-950/40">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Terverifikasi Monetisasi (YPP)</span>
        </span>
      </div>
    );
  }

  if (status === 'ALMOST_MONETIZED') {
    return (
      <div className={`flex flex-col gap-2 w-full max-w-[220px] ${className}`}>
        {/* Top line: Simple amber pill badge + small total percentage badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-800/60 shadow-xs">
            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Hampir Monetisasi</span>
          </span>
          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-neutral-900 text-amber-400 border border-amber-900/50">
            {overallPercent}%
          </span>
        </div>

        {/* Bottom lines: Compact, neat horizontal progress bars with extra vertical space */}
        {showDetails && (
          <div className="space-y-2 pt-1 w-full">
            {/* Subscriber progress */}
            <div className="space-y-1 w-full">
              <div className="flex items-center justify-between text-[10px] leading-tight text-neutral-400">
                <span className="text-neutral-400 font-medium">Subscriber:</span>
                <span className="font-mono font-semibold text-neutral-200">
                  {subscribers.toLocaleString('id-ID')} / 1.000 Sub
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${subPercent}%` }}
                />
              </div>
            </div>

            {/* Watch Hours progress */}
            <div className="space-y-1 w-full">
              <div className="flex items-center justify-between text-[10px] leading-tight text-neutral-400">
                <span className="text-neutral-400 font-medium">Jam Tayang:</span>
                <span className="font-mono font-semibold text-neutral-200">
                  {watchHours.toLocaleString('id-ID')} / 4.000 Jam
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${watchPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center ${className}`}>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700/60">
        <AlertCircle className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <span>Belum Monetisasi</span>
      </span>
    </div>
  );
};
