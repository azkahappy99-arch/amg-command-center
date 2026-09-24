import React, { useMemo, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Radio,
  Users,
  Film,
  Layers,
  ArrowUpRight,
  PieChart as PieIcon,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Channel } from '../types/index';
import { formatIDR, formatCompactIDR, MonetizationBadge } from './MonetizationBadge';
import { NicheBadge, getNicheMeta, NICHE_PRESETS } from '../utils/nicheCategories';

interface RevenueAnalyticsViewProps {
  channels: Channel[];
}

export const RevenueAnalyticsView: React.FC<RevenueAnalyticsViewProps> = ({ channels }) => {
  const [expandedNiche, setExpandedNiche] = useState<string | null>(null);

  // 1. Calculate Global Master Revenue Statistics
  const globalStats = useMemo(() => {
    let totalRevenue = 0;
    let totalAdSense = 0;
    let totalLiveStream = 0;
    let totalShopping = 0;
    let totalMemberships = 0;
    let monetizedChannelsCount = 0;
    let almostMonetizedCount = 0;
    let notMonetizedCount = 0;

    channels.forEach((c) => {
      const rev = c.revenue || {
        adSenseReguler: 0,
        liveStream: 0,
        ytShopping: 0,
        channelMemberships: 0,
        totalChannelRevenue: 0,
      };

      totalRevenue += rev.totalChannelRevenue || 0;
      totalAdSense += rev.adSenseReguler || 0;
      totalLiveStream += rev.liveStream || 0;
      totalShopping += rev.ytShopping || 0;
      totalMemberships += rev.channelMemberships || 0;

      if (c.monetizationStatus === 'MONETIZED') monetizedChannelsCount++;
      else if (c.monetizationStatus === 'ALMOST_MONETIZED') almostMonetizedCount++;
      else notMonetizedCount++;
    });

    return {
      totalRevenue,
      totalAdSense,
      totalLiveStream,
      totalShopping,
      totalMemberships,
      monetizedChannelsCount,
      almostMonetizedCount,
      notMonetizedCount,
    };
  }, [channels]);

  // 2. Group revenue per Niche Category
  const nicheRevenueBlocks = useMemo(() => {
    const groups: Record<
      string,
      {
        niche: string;
        channels: Channel[];
        totalRevenue: number;
        adSense: number;
        liveStream: number;
        shopping: number;
        memberships: number;
        monetizedCount: number;
      }
    > = {};

    channels.forEach((c) => {
      const niche = c.nicheCategory || 'General';
      if (!groups[niche]) {
        groups[niche] = {
          niche,
          channels: [],
          totalRevenue: 0,
          adSense: 0,
          liveStream: 0,
          shopping: 0,
          memberships: 0,
          monetizedCount: 0,
        };
      }

      const rev = c.revenue || {
        adSenseReguler: 0,
        liveStream: 0,
        ytShopping: 0,
        channelMemberships: 0,
        totalChannelRevenue: 0,
      };

      groups[niche].channels.push(c);
      groups[niche].totalRevenue += rev.totalChannelRevenue || 0;
      groups[niche].adSense += rev.adSenseReguler || 0;
      groups[niche].liveStream += rev.liveStream || 0;
      groups[niche].shopping += rev.ytShopping || 0;
      groups[niche].memberships += rev.channelMemberships || 0;

      if (c.monetizationStatus === 'MONETIZED') {
        groups[niche].monetizedCount++;
      }
    });

    return Object.values(groups).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [channels]);

  return (
    <div className="space-y-6 overflow-x-hidden max-w-full w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60 max-w-full">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-400" />
              STATUS MONETISASI & PELACAK PENDAPATAN
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              YPP LIVE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Pelacak performa monetisasi multi-channel, estimasi penghasilan per niche & ringkasan pendapatan kotor IDR.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 font-medium">
            Mata Uang: <strong className="text-emerald-400 font-mono">IDR (Rupiah)</strong>
          </span>
        </div>
      </div>

      {/* 4. MASTER INCOME OVERVIEW: Global Total Revenue Card */}
      <div className="rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 border border-emerald-900/40 p-6 sm:p-8 shadow-2xl relative overflow-hidden max-w-full">
        {/* Glow backdrop */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Total Akumulasi Pendapatan Seluruh Channel</span>
              </div>
              <div className="text-3xl sm:text-5xl font-black text-neutral-100 tracking-tight font-mono">
                {formatIDR(globalStats.totalRevenue)}
              </div>
              <div className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                <span>Gabungan seluruh pendapatan aktif dari {channels.length} channel terkelola</span>
                <span className="text-neutral-600">•</span>
                <span className="text-emerald-400 font-semibold">
                  {globalStats.monetizedChannelsCount} Channel Monetized (YPP)
                </span>
              </div>
            </div>

            {/* Monetization Status Summary Pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3.5 py-2 rounded-2xl bg-neutral-950/80 border border-emerald-800/40 text-center">
                <div className="text-[10px] uppercase font-bold text-neutral-500">YPP Aktif</div>
                <div className="text-lg font-bold text-emerald-400 font-mono">
                  {globalStats.monetizedChannelsCount}
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-2xl bg-neutral-950/80 border border-amber-800/40 text-center">
                <div className="text-[10px] uppercase font-bold text-neutral-500">Hampir YPP</div>
                <div className="text-lg font-bold text-amber-400 font-mono">
                  {globalStats.almostMonetizedCount}
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-2xl bg-neutral-950/80 border border-neutral-800 text-center">
                <div className="text-[10px] uppercase font-bold text-neutral-500">Belum YPP</div>
                <div className="text-lg font-bold text-neutral-400 font-mono">
                  {globalStats.notMonetizedCount}
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Breakdown by Stream */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-neutral-800/80">
            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                <Film className="w-3.5 h-3.5 text-red-400" />
                <span>AdSense Reguler</span>
              </div>
              <div className="text-lg font-bold text-neutral-100 font-mono">
                {formatCompactIDR(globalStats.totalAdSense)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {globalStats.totalRevenue > 0
                  ? `${Math.round((globalStats.totalAdSense / globalStats.totalRevenue) * 100)}% dari total`
                  : '0%'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                <span>Live Super Chat</span>
              </div>
              <div className="text-lg font-bold text-neutral-100 font-mono">
                {formatCompactIDR(globalStats.totalLiveStream)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {globalStats.totalRevenue > 0
                  ? `${Math.round((globalStats.totalLiveStream / globalStats.totalRevenue) * 100)}% dari total`
                  : '0%'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                <span>YouTube Shopping</span>
              </div>
              <div className="text-lg font-bold text-neutral-100 font-mono">
                {formatCompactIDR(globalStats.totalShopping)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {globalStats.totalRevenue > 0
                  ? `${Math.round((globalStats.totalShopping / globalStats.totalRevenue) * 100)}% dari total`
                  : '0%'}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800/80">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-1">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span>Langganan / Gift</span>
              </div>
              <div className="text-lg font-bold text-neutral-100 font-mono">
                {formatCompactIDR(globalStats.totalMemberships)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {globalStats.totalRevenue > 0
                  ? `${Math.round((globalStats.totalMemberships / globalStats.totalRevenue) * 100)}% dari total`
                  : '0%'}
              </div>
            </div>
          </div>

          {/* Contribution Progress Bar by Niche */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-semibold flex items-center gap-1.5">
                <PieIcon className="w-3.5 h-3.5 text-emerald-400" />
                Kontribusi Pendapatan per Kategori Niche
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">
                {nicheRevenueBlocks.length} Blok Kategori Aktif
              </span>
            </div>

            <div className="h-3 w-full bg-neutral-950 rounded-full overflow-hidden flex border border-neutral-800">
              {nicheRevenueBlocks.map((block) => {
                const percentage =
                  globalStats.totalRevenue > 0
                    ? Math.round((block.totalRevenue / globalStats.totalRevenue) * 100)
                    : 0;
                if (percentage === 0) return null;
                const meta = getNicheMeta(block.niche);

                return (
                  <div
                    key={block.niche}
                    title={`${block.niche}: ${formatIDR(block.totalRevenue)} (${percentage}%)`}
                    style={{ width: `${percentage}%` }}
                    className={`h-full ${meta.dotClass} hover:opacity-80 transition cursor-pointer`}
                  />
                );
              })}
            </div>

            {/* Legend badges */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {nicheRevenueBlocks.map((block) => {
                const percentage =
                  globalStats.totalRevenue > 0
                    ? Math.round((block.totalRevenue / globalStats.totalRevenue) * 100)
                    : 0;
                const meta = getNicheMeta(block.niche);

                return (
                  <div key={block.niche} className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                    <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                    <span className="font-semibold">{meta.label}:</span>
                    <span className="font-mono text-neutral-400 font-bold">{percentage}%</span>
                    <span className="text-neutral-500 font-mono">({formatCompactIDR(block.totalRevenue)})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BLOK PENDAPATAN PER KATEGORI NICHE */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-100 uppercase tracking-wide flex items-center gap-2">
            <Layers className="w-5 h-5 text-red-500" />
            Rincian Finansial per Blok Niche
          </h2>
          <span className="text-xs text-neutral-500">
            Terisolasi berdasarkan profil kategori niche
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5">
          {nicheRevenueBlocks.map((block) => {
            const meta = getNicheMeta(block.niche);
            const isExpanded = expandedNiche === block.niche;
            const contributionPercent =
              globalStats.totalRevenue > 0
                ? Math.round((block.totalRevenue / globalStats.totalRevenue) * 100)
                : 0;

            return (
              <div
                key={block.niche}
                className="rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700/80 transition overflow-hidden shadow-lg"
              >
                {/* Header Block Banner */}
                <div className="p-5 bg-gradient-to-r from-neutral-950 via-neutral-900/80 to-neutral-950 border-b border-neutral-800/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`w-3.5 h-3.5 rounded-full ${meta.dotClass} shadow`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="text-base font-black text-neutral-100 uppercase tracking-wide">
                            Niche {meta.label}
                          </h3>
                          <NicheBadge category={block.niche} />
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {contributionPercent}% Kontribusi Total
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {block.channels.length} channel terdaftar ({block.monetizedCount} aktif monetisasi)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase block mb-1">
                          Total Pendapatan Niche
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                          {formatIDR(block.totalRevenue)}
                        </span>
                      </div>

                      <button
                        onClick={() => setExpandedNiche(isExpanded ? null : block.niche)}
                        className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
                        title={isExpanded ? 'Tutup Rincian' : 'Buka Rincian Channel'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* 4 Financial Streams Pill Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-neutral-800/60">
                    <div className="p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800/60">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Film className="w-3 h-3 text-red-400" />
                        <span>AdSense Reguler</span>
                      </div>
                      <div className="text-sm font-bold text-neutral-200 font-mono mt-0.5">
                        {formatIDR(block.adSense)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800/60">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Radio className="w-3 h-3 text-blue-400" />
                        <span>Live Super Chat</span>
                      </div>
                      <div className="text-sm font-bold text-neutral-200 font-mono mt-0.5">
                        {formatIDR(block.liveStream)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800/60">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3 text-amber-400" />
                        <span>YT Shopping</span>
                      </div>
                      <div className="text-sm font-bold text-neutral-200 font-mono mt-0.5">
                        {formatIDR(block.shopping)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-neutral-950/70 border border-neutral-800/60">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Users className="w-3 h-3 text-purple-400" />
                        <span>Membership / Gift</span>
                      </div>
                      <div className="text-sm font-bold text-neutral-200 font-mono mt-0.5">
                        {formatIDR(block.memberships)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Channel List Table inside this Niche */}
                <div className="p-4 overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900/60">
                  <table className="w-full min-w-[680px] text-left text-xs text-neutral-300">
                    <thead className="text-[10px] uppercase font-bold text-neutral-500 border-b border-neutral-800/80">
                      <tr>
                        <th className="pb-2.5 px-3 min-w-[170px]">Channel</th>
                        <th className="pb-2.5 px-3 min-w-[220px]">Status Monetisasi</th>
                        <th className="pb-2.5 px-3 text-right min-w-[110px]">AdSense Reguler</th>
                        <th className="pb-2.5 px-3 text-right min-w-[100px]">Live Chat</th>
                        <th className="pb-2.5 px-3 text-right min-w-[100px]">YT Shopping</th>
                        <th className="pb-2.5 px-3 text-right min-w-[110px]">Membership</th>
                        <th className="pb-2.5 px-3 text-right min-w-[130px]">Total Pendapatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/40">
                      {block.channels.map((chan) => {
                        const rev = chan.revenue || {
                          adSenseReguler: 0,
                          liveStream: 0,
                          ytShopping: 0,
                          channelMemberships: 0,
                          totalChannelRevenue: 0,
                        };

                        return (
                          <tr key={chan.id} className="hover:bg-neutral-800/30 transition">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={chan.thumbnailUrl || 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=160'}
                                  alt={chan.title}
                                  className="w-8 h-8 rounded-lg object-cover border border-neutral-800 shrink-0"
                                />
                                <div>
                                  <div className="font-bold text-neutral-100 whitespace-nowrap">{chan.title}</div>
                                  <div className="text-[10px] text-neutral-500 font-mono whitespace-nowrap">
                                    {chan.customUrl || chan.youtubeChannelId}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-3 min-w-[220px] align-middle">
                              <MonetizationBadge
                                status={chan.monetizationStatus}
                                subscribers={chan.subscriberCount || 0}
                                watchHours={chan.watchHours || 0}
                              />
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-neutral-200 whitespace-nowrap">
                              {formatIDR(rev.adSenseReguler)}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-neutral-200 whitespace-nowrap">
                              {formatIDR(rev.liveStream)}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-neutral-200 whitespace-nowrap">
                              {formatIDR(rev.ytShopping)}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-neutral-200 whitespace-nowrap">
                              {formatIDR(rev.channelMemberships)}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              {formatIDR(rev.totalChannelRevenue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
