import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ScheduleAlertStatus } from '../types/index.ts';

interface ScheduleBufferBadgeProps {
  days?: number;
  stockCount?: number;
  status?: ScheduleAlertStatus;
  exhaustionDate?: string;
  className?: string;
}

/**
 * ScheduleBufferBadge
 * Displays adaptive indicator: "Cadangan Jadwal: [X] Hari ([Y] Video Terjadwal)"
 * Colors:
 * - SAFE: Green (bg-emerald-950/80 text-emerald-300 border-emerald-800/60)
 * - LOW_STOCK: Yellow/Amber (bg-amber-950/80 text-amber-300 border-amber-800/60)
 * - CRITICAL: Red (bg-rose-950/80 text-rose-300 border-rose-800/60)
 */
export const ScheduleBufferBadge: React.FC<ScheduleBufferBadgeProps> = ({
  days = 0,
  stockCount = 0,
  status = 'CRITICAL',
  className = '',
}) => {
  const isCritical = status === 'CRITICAL';
  const isLowStock = status === 'LOW_STOCK';

  const badgeColorClass = isCritical
    ? 'bg-rose-950/80 text-rose-300 border-rose-800/60'
    : isLowStock
    ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';

  const dotColorClass = isCritical
    ? 'bg-rose-500 animate-pulse'
    : isLowStock
    ? 'bg-amber-400'
    : 'bg-emerald-400';

  const Icon = isCritical
    ? AlertCircle
    : isLowStock
    ? AlertTriangle
    : CheckCircle2;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${badgeColorClass} ${className} transition-all`}
      title={`Status Cadangan: ${status} • Sisa ${days} hari • ${stockCount} video terjadwal`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColorClass}`} />
      <Icon className="w-3 h-3 shrink-0 opacity-80" />
      <span className="truncate">
        Cadangan Jadwal: <strong className="font-bold">{days} Hari</strong> ({stockCount} Video Terjadwal)
      </span>
    </div>
  );
};
