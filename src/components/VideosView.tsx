import React, { useState, useMemo } from 'react';
import {
  Film,
  Search,
  Filter,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckSquare,
  Square,
  FolderKanban,
} from 'lucide-react';
import { ManagedVideo, Channel, VideoManagementStatus, ManagementScope } from '../types/index.ts';
import { api } from '../services/api.ts';
import { NicheBadge, NICHE_PRESETS } from '../utils/nicheCategories';

interface VideosViewProps {
  videos: ManagedVideo[];
  channels: Channel[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const VideosView: React.FC<VideosViewProps> = ({
  videos,
  channels,
  onRefresh,
  isRefreshing,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('ALL');
  const [nicheCategoryFilter, setNicheCategoryFilter] = useState<string>('ALL');
  const [managedFilter, setManagedFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [scopeFilter, setScopeFilter] = useState<string>('ALL');
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);

  // Map channelId to channel object for instant niche lookup
  const channelMap = useMemo(() => {
    const map = new Map<string, Channel>();
    channels.forEach((c) => map.set(c.id, c));
    return map;
  }, [channels]);

  // Scope statistics across current channel or all channels
  const channelVideos = selectedChannelId === 'ALL' ? videos : videos.filter(v => v.channelId === selectedChannelId);
  const includedCount = channelVideos.filter(v => v.managementScope === 'REGULAR' && v.isAmgEligible).length;
  const needsScopeCount = channelVideos.filter(v => v.managementScope === 'UNCLASSIFIED' || !v.managementScope).length;
  const excludedCount = channelVideos.filter(v => v.managementScope === 'EXCLUDED').length;

  const filteredVideos = videos.filter((v) => {
    const matchesSearch =
      v.titleBefore.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.titleAssigned && v.titleAssigned.toLowerCase().includes(searchQuery.toLowerCase())) ||
      v.youtubeVideoId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesChannel = selectedChannelId === 'ALL' || v.channelId === selectedChannelId;
    const parentChannel = channelMap.get(v.channelId);
    const videoNiche = parentChannel?.nicheCategory || 'General';
    const matchesNiche = nicheCategoryFilter === 'ALL' || videoNiche === nicheCategoryFilter;

    const matchesManaged =
      managedFilter === 'ALL'
        ? true
        : managedFilter === 'UNMANAGED'
        ? !v.isManaged
        : v.isManaged;
    const matchesStatus = statusFilter === 'ALL' || v.managementStatus === statusFilter;
    const matchesScope =
      scopeFilter === 'ALL'
        ? true
        : scopeFilter === 'REGULAR'
        ? v.managementScope === 'REGULAR' && v.isAmgEligible
        : scopeFilter === 'UNCLASSIFIED'
        ? v.managementScope === 'UNCLASSIFIED' || !v.managementScope
        : v.managementScope === 'EXCLUDED';

    return matchesSearch && matchesChannel && matchesNiche && matchesManaged && matchesStatus && matchesScope;
  });

  const handleSelectAll = () => {
    if (selectedVideoIds.length === filteredVideos.length) {
      setSelectedVideoIds([]);
    } else {
      setSelectedVideoIds(filteredVideos.map((v) => v.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedVideoIds.includes(id)) {
      setSelectedVideoIds(selectedVideoIds.filter((vId) => vId !== id));
    } else {
      setSelectedVideoIds([...selectedVideoIds, id]);
    }
  };

  const handleUpdateSingleScope = async (videoId: string, scope: ManagementScope, reason?: string) => {
    setIsUpdatingScope(true);
    try {
      await api.updateVideoScope(videoId, { managementScope: scope, exclusionReason: reason });
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update video scope');
    } finally {
      setIsUpdatingScope(false);
    }
  };

  const handleBulkScope = async (scope: ManagementScope) => {
    if (selectedVideoIds.length === 0) return;
    setIsUpdatingScope(true);
    try {
      await api.bulkUpdateVideoScope({
        videoIds: selectedVideoIds,
        managementScope: scope,
        exclusionReason: scope === 'EXCLUDED' ? 'Excluded by user bulk action' : undefined,
      });
      setSelectedVideoIds([]);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update bulk scopes');
    } finally {
      setIsUpdatingScope(false);
    }
  };

  const getScopeBadge = (scope?: ManagementScope, isEligible?: boolean) => {
    if (scope === 'REGULAR' && isEligible) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60 shadow-sm">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          AMG REGULAR
        </span>
      );
    }
    if (scope === 'EXCLUDED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-neutral-400 border border-neutral-700 shadow-sm">
          <ShieldX className="w-3 h-3 text-neutral-400" />
          EXCLUDED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800/60 shadow-sm">
        <ShieldAlert className="w-3 h-3 text-amber-400" />
        NEEDS SCOPE
      </span>
    );
  };

  const getStatusBadge = (status: VideoManagementStatus) => {
    switch (status) {
      case 'COMPLETED':
      case 'VERIFIED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40">
            {status}
          </span>
        );
      case 'SCHEDULED':
      case 'SCHEDULE_PENDING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800/40">
            {status}
          </span>
        );
      case 'TITLE_APPLIED':
      case 'THUMBNAIL_APPLIED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800/40">
            {status}
          </span>
        );
      case 'READY':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800/40">
            {status}
          </span>
        );
      case 'NEW_PRIVATE_CANDIDATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
            CANDIDATE
          </span>
        );
      case 'PROTECTED_BY_CUTOFF':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
            PROTECTED_BY_CUTOFF
          </span>
        );
      case 'PROTECTED_OLD':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
            PROTECTED_OLD
          </span>
        );
      case 'EXCLUDED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-neutral-400 border border-neutral-700">
            EXCLUDED
          </span>
        );
      case 'DISCOVERED':
      case 'VALIDATING':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800/40">
            {status}
          </span>
        );
      case 'ERROR':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800/40">
            {status}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-800 text-neutral-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <Film className="w-6 h-6 text-red-500" />
            Katalog Video & Proteksi Lingkup
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Lingkup Pengelolaan Ketat: Hanya video yang ditandai secara eksplisit sebagai AMG Reguler yang dapat masuk otomasi. Video pribadi & keluarga tetap terlindungi.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs font-semibold transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-500' : ''}`} />
          <span>Segarkan Video</span>
        </button>
      </div>

      {/* Scope Protection Summary Card */}
      <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 text-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">
              Status Proteksi Lingkup
            </span>
          </div>
          <div className="text-[11px] text-neutral-400">
            Aturan: <span className="text-neutral-200 font-medium">PRIVAT bukan berarti layak otomatis</span> • Wajib persetujuan eksplisit
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* AMG REGULAR / ELIGIBLE */}
          <div
            onClick={() => setScopeFilter(scopeFilter === 'REGULAR' ? 'ALL' : 'REGULAR')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              scopeFilter === 'REGULAR'
                ? 'bg-emerald-950/40 border-emerald-600 ring-1 ring-emerald-500'
                : 'bg-neutral-950/60 border-neutral-800/80 hover:border-emerald-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                AMG Reguler (Layak)
              </span>
              <span className="text-lg font-black text-emerald-400">{includedCount}</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Video seri aktif yang siap untuk penamaan judul, thumbnail & penjadwalan deterministik.
            </p>
          </div>

          {/* NEEDS SCOPE ASSIGNMENT */}
          <div
            onClick={() => setScopeFilter(scopeFilter === 'UNCLASSIFIED' ? 'ALL' : 'UNCLASSIFIED')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              scopeFilter === 'UNCLASSIFIED'
                ? 'bg-amber-950/40 border-amber-600 ring-1 ring-amber-500'
                : 'bg-neutral-950/60 border-neutral-800/80 hover:border-amber-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Perlu Penentuan Lingkup
              </span>
              <span className="text-lg font-black text-amber-400">{needsScopeCount}</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              {needsScopeCount > 0
                ? 'Terlindungi: Video privat menanti klasifikasi Anda sebelum otomasi apa pun.'
                : 'Semua video telah diklasifikasikan dengan aman.'}
            </p>
          </div>

          {/* EXCLUDED */}
          <div
            onClick={() => setScopeFilter(scopeFilter === 'EXCLUDED' ? 'ALL' : 'EXCLUDED')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              scopeFilter === 'EXCLUDED'
                ? 'bg-neutral-800/60 border-neutral-500 ring-1 ring-neutral-400'
                : 'bg-neutral-950/60 border-neutral-800/80 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-300 flex items-center gap-1.5">
                <ShieldX className="w-3.5 h-3.5 text-neutral-400" />
                Dikecualikan (Terlindungi)
              </span>
              <span className="text-lg font-black text-neutral-300">{excludedCount}</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Video pribadi/lama yang dijamin tidak akan diubah, dipublikasikan, atau dipakai sebagai kursor.
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedVideoIds.length > 0 && (
        <div className="p-3.5 rounded-xl bg-neutral-900 border border-red-500/40 shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/40">
              {selectedVideoIds.length} Dipilih
            </span>
            <span>Tentukan lingkup pengelolaan untuk video terpilih:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkScope('REGULAR')}
              disabled={isUpdatingScope}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Masukkan ke AMG Reguler</span>
            </button>

            <button
              onClick={() => handleBulkScope('EXCLUDED')}
              disabled={isUpdatingScope}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition flex items-center gap-1.5"
            >
              <ShieldX className="w-3.5 h-3.5" />
              <span>Kecualikan Terpilih</span>
            </button>

            <button
              onClick={() => setSelectedVideoIds([])}
              className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 text-xs transition"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan judul asli, judul hasil otomasi, atau YouTube ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Niche selector */}
          <select
            value={nicheCategoryFilter}
            onChange={(e) => setNicheCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Kategori Niche</option>
            {NICHE_PRESETS.map((p) => (
              <option key={p.category} value={p.category}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Channel selector */}
          <select
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* Scope filter */}
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer font-medium"
          >
            <option value="ALL">Semua Lingkup ({videos.length})</option>
            <option value="REGULAR">AMG Reguler ({includedCount})</option>
            <option value="UNCLASSIFIED">Perlu Lingkup ({needsScopeCount})</option>
            <option value="EXCLUDED">Dikecualikan / Terlindungi ({excludedCount})</option>
          </select>

          {/* Managed vs Unmanaged */}
          <select
            value={managedFilter}
            onChange={(e) => setManagedFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Status Kelola</option>
            <option value="UNMANAGED">Belum Dikelola (Baru / Tertunda)</option>
            <option value="MANAGED">Terkelola (Sudah Diproses)</option>
          </select>

          {/* State filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Tahap Pipeline</option>
            <option value="DISCOVERED">DISCOVERED</option>
            <option value="VALIDATING">VALIDATING</option>
            <option value="READY">READY</option>
            <option value="TITLE_APPLIED">TITLE_APPLIED</option>
            <option value="THUMBNAIL_APPLIED">THUMBNAIL_APPLIED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>
      </div>

      {/* Videos List / Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-3.5 px-3 w-10 text-center">
                  <button onClick={handleSelectAll} className="text-neutral-400 hover:text-white">
                    {selectedVideoIds.length === filteredVideos.length && filteredVideos.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-red-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">Video / Aliran Mentah</th>
                <th className="py-3.5 px-4">Lingkup Pengelolaan</th>
                <th className="py-3.5 px-4">Channel</th>
                <th className="py-3.5 px-4">Judul Master Diterapkan</th>
                <th className="py-3.5 px-4">Transcoding</th>
                <th className="py-3.5 px-4">Target Publikasi</th>
                <th className="py-3.5 px-4">Tindakan Lingkup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    Tidak ada video yang cocok dengan filter Anda.
                  </td>
                </tr>
              ) : (
                filteredVideos.map((video) => {
                  const isSelected = selectedVideoIds.includes(video.id);
                  const isRegular = video.managementScope === 'REGULAR' && video.isAmgEligible;
                  const isExcluded = video.managementScope === 'EXCLUDED';
                  const isUnclassified = !video.managementScope || video.managementScope === 'UNCLASSIFIED';

                  return (
                    <tr
                      key={video.id}
                      className={`hover:bg-neutral-800/40 transition ${
                        isSelected ? 'bg-neutral-800/30' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => handleToggleSelect(video.id)}
                          className="text-neutral-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-red-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Video ID & Raw Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="relative shrink-0">
                            <img
                              src={
                                video.thumbnailAssigned ||
                                video.thumbnailBefore ||
                                'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=120'
                              }
                              alt=""
                              className="w-16 h-10 rounded-lg object-cover border border-neutral-700/60"
                            />
                            <span className="absolute bottom-1 right-1 text-[9px] px-1 py-0.2 rounded bg-black/80 font-mono text-neutral-300">
                              {video.definition ? video.definition.toUpperCase() : 'HD'}
                            </span>
                          </div>
                          <div>
                            <div className="font-semibold text-neutral-100 max-w-[240px] truncate flex items-center gap-1.5">
                              <span>{video.titleBefore}</span>
                              {video.isSeeded ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-400 font-mono shrink-0">
                                  FIXTURE
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 font-mono shrink-0 border border-emerald-800/40">
                                  REAL YT
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                              ID: {video.youtubeVideoId} • {video.privacyStatus}
                            </div>
                            {video.exclusionReason && (
                              <div className="text-[10px] text-neutral-400 italic mt-0.5 max-w-[240px] truncate">
                                Reason: {video.exclusionReason}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Management Scope Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getScopeBadge(video.managementScope, video.isAmgEligible)}
                      </td>

                      {/* Channel with Niche */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="px-2 py-0.5 rounded-lg bg-neutral-800 text-neutral-200 font-semibold text-[11px]">
                            {video.channelTitle || 'Ayam Warna'}
                          </span>
                          {channelMap.get(video.channelId)?.nicheCategory && (
                            <NicheBadge
                              category={channelMap.get(video.channelId)?.nicheCategory}
                              badgeKey={channelMap.get(video.channelId)?.nicheBadge}
                            />
                          )}
                        </div>
                      </td>

                      {/* Master Title */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        {video.titleAssigned ? (
                          <span className="font-medium text-emerald-400">
                            {video.titleAssigned}
                          </span>
                        ) : isExcluded ? (
                          <span className="text-neutral-500 italic">Dikecualikan / Tidak Disentuh</span>
                        ) : isUnclassified ? (
                          <span className="text-amber-500/80 italic">Perlu Penentuan Lingkup</span>
                        ) : (
                          <span className="text-neutral-500 italic">Menunggu Otomasi AMG</span>
                        )}
                      </td>

                      {/* Transcoding / HD status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {video.processingStatus === 'processed' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>HD Siap</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400 text-[11px] font-semibold">
                            <Clock className="w-3.5 h-3.5 animate-spin" />
                            <span>Transcoding</span>
                          </span>
                        )}
                      </td>

                      {/* Target Publish */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {video.scheduledPublishAt ? (
                          <div className="text-neutral-200 font-medium">
                            {new Date(video.scheduledPublishAt).toLocaleDateString([], {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            {isExcluded && (
                              <span className="text-[10px] text-neutral-500 block font-mono">
                                (Dikecualikan Manual)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-500 italic">Belum Dijadwalkan</span>
                        )}
                      </td>

                      {/* Inline Scope Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isUnclassified && (
                            <>
                              <button
                                onClick={() => handleUpdateSingleScope(video.id, 'REGULAR')}
                                disabled={isUpdatingScope}
                                className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 font-semibold text-[11px] transition cursor-pointer"
                              >
                                + Masukkan Reguler
                              </button>
                              <button
                                onClick={() => handleUpdateSingleScope(video.id, 'EXCLUDED', 'Personal / Non-AMG video')}
                                disabled={isUpdatingScope}
                                className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-neutral-700 font-medium text-[11px] transition cursor-pointer"
                              >
                                Kecualikan
                              </button>
                            </>
                          )}

                          {isRegular && (
                            <button
                              onClick={() => handleUpdateSingleScope(video.id, 'EXCLUDED', 'Removed from regular AMG content')}
                              disabled={isUpdatingScope}
                              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 border border-neutral-700 font-medium text-[11px] transition cursor-pointer"
                            >
                              Kecualikan dari AMG
                            </button>
                          )}

                          {isExcluded && (
                            <button
                              onClick={() => handleUpdateSingleScope(video.id, 'REGULAR')}
                              disabled={isUpdatingScope}
                              className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 font-semibold text-[11px] transition cursor-pointer"
                            >
                              Pulihkan ke Reguler
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
