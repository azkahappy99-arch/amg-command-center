import React, { useState, useMemo } from 'react';
import {
  Tv,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Layers,
  Trash2,
  Key,
  Clock,
  Radio,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Info,
  Database,
  Film,
  UserCheck,
  Sliders,
  FolderKanban,
  SlidersHorizontal,
  Tag,
  PlayCircle,
  Sparkles,
  ChevronRight,
  MoreVertical,
  X,
} from 'lucide-react';
import { Channel, ContentProfile, ScheduleConfig, NicheCategoryPreset } from '../types/index.ts';
import { api } from '../services/api.ts';
import { YouTubeOAuthModal } from './YouTubeOAuthModal.tsx';
import { ScheduleConfigEditor } from './ScheduleConfigEditor.tsx';
import { CandidateDetectionModal } from './CandidateDetectionModal.tsx';
import { ChannelEligibilityModal } from './ChannelEligibilityModal.tsx';
import { NicheBadge, getNicheMeta, NICHE_PRESETS } from '../utils/nicheCategories';
import { MonetizationBadge, formatIDR } from './MonetizationBadge';
import { ScheduleBufferBadge } from './ScheduleBufferBadge';
import {
  authorizeAndFetchYouTubeChannel,
  fetchMyYouTubeChannel,
  getStoredGisToken,
} from '../services/youtubeGisAuth.ts';

interface ChannelsViewProps {
  channels: Channel[];
  profiles: ContentProfile[];
  onChannelUpdated: () => void;
  onNavigateToAutomation: (channelId: string) => void;
}

interface SyncModalData {
  channelTitle: string;
  youtubeChannelId: string;
  uploadPlaylistId?: string;
  syncTimestamp: string;
  detectedTotal: number;
  newUnmanaged: number;
  alreadyManaged: number;
  actualFetchedFromYouTube: number;
  readOnlyMode: boolean;
  sampleVideos?: Array<{
    id: string;
    title: string;
    privacyStatus: string;
    uploadStatus?: string;
    publishAt?: string;
    definition?: string;
    duration?: string;
    thumbnailUrl?: string;
  }>;
}

interface TestConnData {
  channelTitle: string;
  youtubeChannelId: string;
  status: string;
  hasActiveOAuthToken: boolean;
  hasRefreshToken: boolean;
  accountEmail: string | null;
  expiresAt: string | null;
  liveChannelAccessible: boolean;
  liveVideosCount: number;
  error: string | null;
}

export const ChannelsView: React.FC<ChannelsViewProps> = ({
  channels,
  profiles,
  onChannelUpdated,
  onNavigateToAutomation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedChannelForOAuth, setSelectedChannelForOAuth] = useState<Channel | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [syncResultModal, setSyncResultModal] = useState<SyncModalData | null>(null);
  const [testConnModal, setTestConnModal] = useState<TestConnData | null>(null);
  const [isPurgingDemo, setIsPurgingDemo] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Channel Custom Scheduling Modal State
  const [selectedChannelForSchedule, setSelectedChannelForSchedule] = useState<Channel | null>(null);
  const [selectedChannelForCandidates, setSelectedChannelForCandidates] = useState<Channel | null>(null);
  const [selectedChannelForEligibility, setSelectedChannelForEligibility] = useState<Channel | null>(null);
  const [scheduleConfigState, setScheduleConfigState] = useState<ScheduleConfig>({
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 3,
    times: ['08:00', '14:00', '20:00'],
    timezone: 'Asia/Jakarta',
  });
  const [useProfileScheduleState, setUseProfileScheduleState] = useState<boolean>(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [schedulePreviewSlots, setSchedulePreviewSlots] = useState<any[]>([]);
  const [isLoadingSchedulePreview, setIsLoadingSchedulePreview] = useState(false);

  // New Channel Form state
  const [newTitle, setNewTitle] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [newProfileId, setNewProfileId] = useState(profiles[0]?.id || '');
  const [newNicheCategory, setNewNicheCategory] = useState<string>('Ayam Warna Warni');
  const [newCustomNiche, setNewCustomNiche] = useState<string>('');
  const [newNicheBadge, setNewNicheBadge] = useState<string>('amber');
  const [newPublishTime, setNewPublishTime] = useState('16:00');
  const [newFrequency, setNewFrequency] = useState('1/day');
  const [newTimezone, setNewTimezone] = useState('Asia/Jakarta');
  const [newScheduleConfig, setNewScheduleConfig] = useState<ScheduleConfig>({
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 1,
    times: ['16:00'],
    timezone: 'Asia/Jakarta',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [selectedNicheTab, setSelectedNicheTab] = useState<string>('ALL');
  const [openMenuChannelId, setOpenMenuChannelId] = useState<string | null>(null);

  // Interactive Niche Tab definitions matching: Semua Niche, Ayam Warna Warni, Musik, ASMR, Murottal (+ custom)
  const nicheTabs = useMemo(() => {
    const tabs: Array<{
      id: string;
      label: string;
      dotClass: string;
      badgeClass: string;
      matcher: (category: string) => boolean;
    }> = [
      {
        id: 'ALL',
        label: 'Semua Niche',
        dotClass: 'bg-neutral-400',
        badgeClass: 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700',
        matcher: () => true,
      },
      {
        id: 'ayam',
        label: 'Ayam Warna Warni',
        dotClass: 'bg-amber-400',
        badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/60 ring-1 ring-amber-500/40',
        matcher: (cat: string) => cat.toLowerCase().includes('ayam'),
      },
      {
        id: 'musik',
        label: 'Musik',
        dotClass: 'bg-cyan-400',
        badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60 ring-1 ring-cyan-500/40',
        matcher: (cat: string) => cat.toLowerCase().includes('music') || cat.toLowerCase().includes('musik'),
      },
      {
        id: 'asmr',
        label: 'ASMR',
        dotClass: 'bg-purple-400',
        badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-800/60 ring-1 ring-purple-500/40',
        matcher: (cat: string) => cat.toLowerCase().includes('asmr'),
      },
      {
        id: 'murottal',
        label: 'Murottal',
        dotClass: 'bg-emerald-400',
        badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60 ring-1 ring-emerald-500/40',
        matcher: (cat: string) => cat.toLowerCase().includes('murottal') || cat.toLowerCase().includes('quran'),
      },
    ];

    channels.forEach((c) => {
      const cat = c.nicheCategory || 'General';
      const isPreset = tabs.slice(1).some((t) => t.matcher(cat));
      if (!isPreset && !tabs.some((t) => t.id === cat)) {
        const meta = getNicheMeta(cat, c.nicheBadge);
        tabs.push({
          id: cat,
          label: meta.label,
          dotClass: meta.dotClass,
          badgeClass: `${meta.badgeClass} ring-1 ring-current`,
          matcher: (channelCat: string) => channelCat.toLowerCase() === cat.toLowerCase(),
        });
      }
    });

    return tabs;
  }, [channels]);

  const currentActiveTab = useMemo(() => {
    return nicheTabs.find((t) => t.id === selectedNicheTab) || nicheTabs[0];
  }, [nicheTabs, selectedNicheTab]);

  // Filter channels by query, status, and niche tab
  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      const matchesSearch =
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.youtubeChannelId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customUrl && c.customUrl.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const matchesTab = currentActiveTab.matcher(c.nicheCategory || 'General');
      return matchesSearch && matchesStatus && matchesTab;
    });
  }, [channels, searchQuery, statusFilter, currentActiveTab]);

  // Group filtered channels by niche
  const groupedChannels = useMemo(() => {
    const groups: Record<string, Channel[]> = {};
    filteredChannels.forEach((c) => {
      const niche = c.nicheCategory || 'General';
      if (!groups[niche]) groups[niche] = [];
      groups[niche].push(c);
    });
    return groups;
  }, [filteredChannels]);

  // Displayed niche blocks based on selected tab
  const displayedNiches = useMemo(() => {
    const allNicheKeys = Object.keys(groupedChannels);
    if (currentActiveTab.id === 'ALL') {
      return allNicheKeys;
    }
    return allNicheKeys.filter((nicheKey) => currentActiveTab.matcher(nicheKey));
  }, [currentActiveTab, groupedChannels]);

  const handleGisAuthorizeChannel = async (channel: Channel) => {
    setSyncingChannelId(channel.id);
    setBannerMessage({
      text: `Membuka dialog otorisasi Google Identity Services untuk "${channel.title}"...`,
      type: 'info',
    });

    try {
      // 1. Inisialisasi google.accounts.oauth2.initTokenClient & buka popup login interaktif
      // 2. Fetch profil & stats langsung dari endpoint YouTube Data API v3 (mine=true)
      const result = await authorizeAndFetchYouTubeChannel(true);

      // 3. Simpan token & sinkronkan detail channel ke backend
      const syncRes = await api.gisSyncChannel({
        channelId: channel.id,
        accessToken: result.accessToken,
        channelData: result.channel,
      });

      setBannerMessage({
        text: `Otorisasi Berhasil! Channel "${result.channel.title}" (${result.channel.id}) telah terhubung langsung via YouTube Data API v3. Status: CONNECTED.`,
        type: 'success',
      });

      onChannelUpdated();
    } catch (err: any) {
      console.error('GIS Authorization error:', err);
      setBannerMessage({
        text: `Gagal otorisasi Google Identity Services: ${err.message || 'Izin akses dibatalkan atau popup diblokir.'}`,
        type: 'error',
      });
      // Fallback: buka modal OAuth jika popup diblokir atau gagal
      setSelectedChannelForOAuth(channel);
    } finally {
      setSyncingChannelId(null);
    }
  };

  const handleSyncChannel = async (channel: Channel) => {
    setSyncingChannelId(channel.id);
    setBannerMessage(null);
    try {
      // Periksa apakah token GIS client sudah tersedia di localStorage
      const storedToken = getStoredGisToken();
      if (storedToken) {
        try {
          const liveDetails = await fetchMyYouTubeChannel(storedToken);
          await api.gisSyncChannel({
            channelId: channel.id,
            accessToken: storedToken,
            channelData: liveDetails,
          });
        } catch (tokenErr) {
          console.warn('GIS Token refresh warning:', tokenErr);
        }
      }

      const res = await api.syncChannel(channel.id);
      setSyncResultModal({
        channelTitle: channel.title,
        youtubeChannelId: res.youtubeChannelId || channel.youtubeChannelId,
        uploadPlaylistId: res.uploadPlaylistId || channel.uploadPlaylistId,
        syncTimestamp: res.syncTimestamp,
        detectedTotal: res.detectedTotal,
        newUnmanaged: res.newUnmanaged,
        alreadyManaged: res.alreadyManaged,
        actualFetchedFromYouTube: res.actualFetchedFromYouTube,
        readOnlyMode: res.readOnlyMode,
        sampleVideos: res.sampleVideos,
      });
      setBannerMessage({
        text: `Sinkronisasi YouTube berhasil untuk "${channel.title}". ${res.actualFetchedFromYouTube} video diperiksa via YouTube Data API v3. Status: CONNECTED.`,
        type: 'success',
      });
      onChannelUpdated();
    } catch (err: any) {
      // Jika butuh otorisasi kredensial, otomatis tawarkan dialog GIS
      if (
        !channel.hasOAuthConfigured ||
        channel.status === 'DISCONNECTED' ||
        err.message?.toLowerCase().includes('credential') ||
        err.message?.toLowerCase().includes('auth')
      ) {
        setBannerMessage({
          text: `Channel "${channel.title}" belum terhubung. Membuka dialog otorisasi Google Identity Services...`,
          type: 'info',
        });
        await handleGisAuthorizeChannel(channel);
      } else {
        setBannerMessage({
          text: `Error syncing channel "${channel.title}": ${err.message}`,
          type: 'error',
        });
      }
    } finally {
      setSyncingChannelId(null);
    }
  };

  const handleTestConnection = async (channel: Channel) => {
    setTestingChannelId(channel.id);
    try {
      const res = await api.testConnection(channel.id);
      setTestConnModal({
        channelTitle: channel.title,
        youtubeChannelId: res.youtubeChannelId,
        status: res.status,
        hasActiveOAuthToken: res.authStatus.hasActiveOAuthToken,
        hasRefreshToken: res.authStatus.hasRefreshToken,
        accountEmail: res.authStatus.accountEmail,
        expiresAt: res.authStatus.expiresAt,
        liveChannelAccessible: res.liveYouTubeProbe.channelAccessible,
        liveVideosCount: res.liveYouTubeProbe.liveVideosCount,
        error: res.liveYouTubeProbe.error,
      });
    } catch (err: any) {
      alert(`Test connection failed: ${err.message}`);
    } finally {
      setTestingChannelId(null);
    }
  };

  const handlePurgeDemoData = async () => {
    if (!confirm('This will purge all mock / seeded demo channels, mock videos, and mock batches. Only genuine YouTube accounts will remain. Continue?')) {
      return;
    }
    setIsPurgingDemo(true);
    try {
      const res = await api.clearDemoData();
      setBannerMessage({
        text: res.message,
        type: 'info',
      });
      onChannelUpdated();
    } catch (err: any) {
      alert(`Failed to clear demo data: ${err.message}`);
    } finally {
      setIsPurgingDemo(false);
    }
  };

  const handleOpenScheduleModal = async (channel: Channel) => {
    setSelectedChannelForSchedule(channel);
    const existingConfig: ScheduleConfig = channel.scheduleConfig || {
      mode: channel.publishFrequency === '1/day' ? 'DAILY' : 'CUSTOM_DAILY_TIMES',
      videosPerDay: channel.publishFrequency === '2/day' ? 2 : 1,
      times: channel.publishTime ? channel.publishTime.split(',').map((s) => s.trim()) : ['16:00'],
      timezone: channel.timezone || 'Asia/Jakarta',
      startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
    };
    setScheduleConfigState(existingConfig);
    setUseProfileScheduleState(channel.useProfileSchedule || false);

    // Fetch initial preview
    setIsLoadingSchedulePreview(true);
    try {
      const res = await api.previewSchedule({
        channelId: channel.id,
        config: existingConfig,
        count: 8,
      });
      if (res.success) {
        setSchedulePreviewSlots(res.slots);
      }
    } catch (err) {
      console.error('Failed to preview schedule slots:', err);
    } finally {
      setIsLoadingSchedulePreview(false);
    }
  };

  const handleUpdateScheduleConfigInModal = async (updatedConfig: ScheduleConfig) => {
    setScheduleConfigState(updatedConfig);
    if (!selectedChannelForSchedule) return;
    try {
      const res = await api.previewSchedule({
        channelId: selectedChannelForSchedule.id,
        config: updatedConfig,
        count: 8,
      });
      if (res.success) {
        setSchedulePreviewSlots(res.slots);
      }
    } catch (err) {
      console.error('Preview error:', err);
    }
  };

  const handleSaveChannelSchedule = async () => {
    if (!selectedChannelForSchedule) return;
    setIsSavingSchedule(true);
    try {
      const res = await api.updateChannelScheduleConfig(selectedChannelForSchedule.id, {
        scheduleConfig: scheduleConfigState,
        useProfileSchedule: useProfileScheduleState,
      });
      if (res.success) {
        setBannerMessage({
          text: `Updated schedule rule for "${selectedChannelForSchedule.title}": ${res.resolvedScheduleConfig.videosPerDay} videos/day @ [${res.resolvedScheduleConfig.times.join(', ')}] ${res.resolvedScheduleConfig.timezone}.`,
          type: 'success',
        });
        setSelectedChannelForSchedule(null);
        onChannelUpdated();
      }
    } catch (err: any) {
      alert(`Failed to save schedule rule: ${err.message}`);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newChannelId) return;
    setIsAdding(true);
    try {
      const finalCategory = newNicheCategory === 'CUSTOM' ? (newCustomNiche.trim() || 'General') : newNicheCategory;
      await api.addChannel({
        title: newTitle,
        youtubeChannelId: newChannelId,
        contentProfileId: newProfileId,
        nicheCategory: finalCategory,
        nicheBadge: newNicheBadge,
        publishFrequency: `${newScheduleConfig.videosPerDay}/day`,
        publishTime: newScheduleConfig.times.join(', '),
        timezone: newScheduleConfig.timezone,
        scheduleConfig: newScheduleConfig,
      });
      setIsAddModalOpen(false);
      setNewTitle('');
      setNewChannelId('');
      setNewCustomNiche('');
      onChannelUpdated();
      setBannerMessage({
        text: `Channel "${newTitle}" created in niche [${finalCategory}] with custom schedule (${newScheduleConfig.videosPerDay} videos/day). Please connect YouTube credentials to authorize.`,
        type: 'success',
      });
    } catch (err: any) {
      alert(err.message || 'Failed to add channel');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteChannel = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to remove channel "${title}" from AMG?`)) return;
    try {
      await api.deleteChannel(id);
      onChannelUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete channel');
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-[0_0_14px_rgba(16,185,129,0.45)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#34d399,0_0_15px_#10b981]"></span>
            </span>
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            CONNECTED
          </span>
        );
      case 'AUTHORIZATION REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-700/60">
            <Key className="w-3 h-3 text-amber-400" />
            AUTHORIZATION REQUIRED
          </span>
        );
      case 'TOKEN EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-700/60">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            TOKEN EXPIRED
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-red-950 text-red-300 border border-red-700/60">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            ERROR
          </span>
        );
      case 'DISCONNECTED':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-neutral-800 text-neutral-400 border border-neutral-700/60">
            <XCircle className="w-3 h-3 text-neutral-500" />
            DISCONNECTED
          </span>
        );
    }
  };

  const hasSeededChannels = channels.some((c) => c.isSeeded);

  return (
    <div className="space-y-6 overflow-x-hidden max-w-full w-full">
      {/* Read-Only Safety Protocol Banner */}
      <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-600/40 text-xs text-amber-200 flex items-center justify-between max-w-full overflow-hidden">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold text-amber-100">READ-ONLY MODE ACTIVE:</span> AMG is in Phase 1 verification mode. Live YouTube sync inspects actual videos and metadata without modifying titles, thumbnails, schedules, or privacy status.
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-[10px] font-mono font-bold text-amber-300 uppercase shrink-0 ml-3">
          Safe Mode
        </span>
      </div>

      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-neutral-800/60 max-w-full">
        <div>
          <h1 className="text-lg sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <Tv className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 shrink-0" />
            <span>Pusat Pengelolaan Channel</span>
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm text-neutral-400 mt-0.5">
            Tautkan, otorisasi, atur profil, dan pantau video privat belum dikelola di seluruh channel YouTube.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition active:scale-95 shadow-lg shadow-red-900/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Channel</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
              : bannerMessage.type === 'error'
              ? 'bg-rose-950/60 border-rose-800 text-rose-200'
              : 'bg-neutral-900 border-neutral-800 text-neutral-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {bannerMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : bannerMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-neutral-400 shrink-0" />
            )}
            {bannerMessage.text}
          </span>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-xs text-neutral-400 hover:text-white ml-3"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Search Bar (Mobile-Compact) */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari channel..."
            className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Filter className="w-3.5 h-3.5 text-neutral-500 hidden sm:block" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="CONNECTED">Terhubung</option>
            <option value="DISCONNECTED">Terputus</option>
            <option value="AUTHORIZATION REQUIRED">Perlu Otorisasi</option>
            <option value="TOKEN EXPIRED">Kedaluwarsa</option>
            <option value="ERROR">Kendala</option>
          </select>
        </div>
      </div>

      {/* Interactive Niche Category Tabs (Compact) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-800/80 scrollbar-none text-xs">
        {nicheTabs.map((tab) => {
          const count =
            tab.id === 'ALL'
              ? channels.length
              : channels.filter((c) => tab.matcher(c.nicheCategory || 'General')).length;
          const isActive = selectedNicheTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setSelectedNicheTab(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                isActive
                  ? tab.badgeClass
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              {tab.id === 'ALL' ? (
                <SlidersHorizontal className="w-3 h-3 text-neutral-400" />
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full ${tab.dotClass}`} />
              )}
              <span>{tab.label}</span>
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-black/40 font-mono opacity-80">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Filter Notification Bar (Compact) */}
      {selectedNicheTab !== 'ALL' && (
        <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-xl bg-neutral-900/70 border border-neutral-800 text-neutral-300">
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${currentActiveTab.dotClass}`} />
            <span>
              Niche: <strong className="text-white">{currentActiveTab.label}</strong> ({displayedNiches.length} blok aktif)
            </span>
          </span>
          <button
            onClick={() => setSelectedNicheTab('ALL')}
            className="text-[11px] font-semibold text-red-400 hover:text-red-300 underline cursor-pointer"
          >
            Lihat Semua Niche
          </button>
        </div>
      )}

      {/* Grouped Channel Blocks by Niche */}
      <div className="space-y-6">
        {displayedNiches.length === 0 ? (
          <div className="p-8 text-center bg-neutral-900/40 rounded-2xl border border-neutral-800 text-neutral-400 text-xs">
            Tidak ada channel ditemukan pada pencarian atau kategori niche ini.
          </div>
        ) : (
          displayedNiches.map((niche) => {
            const chanList = groupedChannels[niche] || [];
            if (chanList.length === 0) return null;
            const meta = getNicheMeta(niche, chanList[0]?.nicheBadge);
            const nicheRevenue = chanList.reduce((acc, c) => acc + (c.revenue?.totalChannelRevenue || 0), 0);

            return (
              <div
                key={niche}
                className="p-5 rounded-2xl bg-neutral-900/50 border border-neutral-800/90 space-y-4 shadow-sm"
              >
                {/* Niche Block Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl border ${meta.badgeClass} flex items-center justify-center shadow-xs`}>
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-neutral-100 uppercase tracking-wider">
                          Blok {meta.label}
                        </h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                          {chanList.length} Channel Terkelola
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">{meta.description}</p>
                    </div>
                  </div>

                  {nicheRevenue > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-950/80 border border-emerald-900/60 self-start sm:self-auto">
                      <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                        Total Pendapatan Niche:
                      </span>
                      <span className="font-bold font-mono text-emerald-300 text-xs">
                        {formatIDR(nicheRevenue)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Channel Cards in this Niche Block */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chanList.map((channel) => {
                    const profile = profiles.find((p) => p.id === channel.contentProfileId);
                    const isSyncing = syncingChannelId === channel.id;
                    const isTesting = testingChannelId === channel.id;

                    return (
                      <div
                        key={channel.id}
                        className="p-5 rounded-2xl bg-neutral-950/70 border border-neutral-800/90 hover:border-neutral-700 flex flex-col justify-between transition group space-y-4 relative shadow-sm"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 relative">
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <img
                              src={channel.thumbnailUrl || 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=160'}
                              alt={channel.title}
                              className="w-12 h-12 rounded-xl object-cover border border-neutral-700/80 shadow shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="font-bold text-sm text-neutral-100 group-hover:text-red-400 transition truncate max-w-[140px] sm:max-w-[170px]">
                                  {channel.title}
                                </h3>
                                <NicheBadge category={channel.nicheCategory} badgeKey={channel.nicheBadge} />
                                {channel.isSeeded && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-400 border border-purple-800/50 uppercase tracking-wider">
                                    Demo
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400 font-mono mt-0.5 truncate">
                                {channel.customUrl || channel.youtubeChannelId}
                              </div>
                            </div>
                          </div>

                          {/* Options Dropdown Trigger Button */}
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuChannelId(openMenuChannelId === channel.id ? null : channel.id);
                              }}
                              className={`p-1.5 rounded-xl border transition cursor-pointer ${
                                openMenuChannelId === channel.id
                                  ? 'bg-neutral-800 border-neutral-700 text-white shadow-sm'
                                  : 'bg-neutral-900/90 hover:bg-neutral-800 border-neutral-800 text-neutral-400 hover:text-neutral-100'
                              }`}
                              title="Opsi Pengaturan Channel"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Popover / Dropdown Menu */}
                            {openMenuChannelId === channel.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-30"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuChannelId(null);
                                  }}
                                />

                                <div
                                  className="absolute right-0 top-full mt-1.5 w-56 rounded-2xl bg-neutral-900/95 backdrop-blur-md border border-neutral-800 shadow-2xl p-1.5 z-40 text-xs space-y-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="px-2.5 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-800/80 mb-1 flex items-center justify-between">
                                    <span>Opsi Pengaturan</span>
                                    <span className="text-[9px] font-mono text-neutral-500">{channel.nicheCategory || 'General'}</span>
                                  </div>

                                  <button
                                    onClick={() => {
                                      setOpenMenuChannelId(null);
                                      handleSyncChannel(channel);
                                    }}
                                    disabled={isSyncing}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-neutral-200 hover:text-white hover:bg-neutral-800 text-left transition cursor-pointer"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 text-neutral-400 ${isSyncing ? 'animate-spin text-red-500' : ''}`} />
                                    <span className="flex-1">{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan YouTube'}</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenMenuChannelId(null);
                                      handleGisAuthorizeChannel(channel);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-neutral-200 hover:text-white hover:bg-neutral-800 text-left transition cursor-pointer"
                                  >
                                    <Key className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="flex-1">Otorisasi OAuth Google</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenMenuChannelId(null);
                                      handleTestConnection(channel);
                                    }}
                                    disabled={isTesting}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-neutral-200 hover:text-white hover:bg-neutral-800 text-left transition cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="flex-1">{isTesting ? 'Menguji...' : 'Uji Koneksi Channel'}</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenMenuChannelId(null);
                                      setSelectedChannelForEligibility(channel);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-neutral-200 hover:text-white hover:bg-neutral-800 text-left transition cursor-pointer"
                                  >
                                    <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                                    <span className="flex-1">Aturan Kelayakan & Batas</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setOpenMenuChannelId(null);
                                      handleOpenScheduleModal(channel);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-neutral-200 hover:text-white hover:bg-neutral-800 text-left transition cursor-pointer"
                                  >
                                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                                    <span className="flex-1">Sesuaikan Jadwal Tayang</span>
                                  </button>

                                  <div className="my-1 border-t border-neutral-800/80" />

                                  <button
                                    onClick={() => {
                                      setOpenMenuChannelId(null);
                                      handleDeleteChannel(channel.id, channel.title);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-left transition cursor-pointer font-medium"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                    <span className="flex-1">Hapus Channel</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Connection Status Badge */}
                        <div className="flex items-center justify-between">
                          {renderStatusBadge(channel.status)}
                          <span className="text-[10px] text-neutral-400">
                            {channel.videoCount !== undefined ? `${channel.videoCount} Total Videos` : ''}
                          </span>
                        </div>

                        {/* Monetization Status Badge */}
                        <div className="pt-0.5">
                          <MonetizationBadge
                            status={channel.monetizationStatus}
                            subscribers={channel.subscriberCount || 0}
                            watchHours={channel.watchHours || 0}
                          />
                          {channel.revenue && channel.revenue.totalChannelRevenue > 0 && (
                            <div className="mt-1.5 flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-neutral-900/80 border border-neutral-800">
                              <span className="text-neutral-400 font-medium">Estimasi Pendapatan:</span>
                              <span className="font-bold font-mono text-emerald-400">
                                {formatIDR(channel.revenue.totalChannelRevenue)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Schedule Buffer Stock Monitor Badge */}
                        <div className="pt-0.5">
                          <ScheduleBufferBadge
                            days={channel.scheduleBufferDays}
                            stockCount={channel.scheduleStockCount}
                            status={channel.scheduleAlertStatus}
                            exhaustionDate={channel.bufferExhaustionDate}
                            className="w-full justify-center"
                          />
                        </div>

                        {/* Channel Stats and Settings Badge */}
                        <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-neutral-800/60">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-neutral-500 uppercase">Profil</span>
                            <div className="font-medium text-neutral-200 truncate">
                              {profile ? profile.name : 'Belum Ditentukan'}
                            </div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-neutral-500 uppercase">Belum Dikelola</span>
                            <div className="font-bold text-amber-400">
                              {channel.unmanagedVideoCount || 0} Video
                            </div>
                          </div>
                          <div className="space-y-0.5 col-span-2 bg-neutral-900/60 p-2 rounded-xl border border-neutral-800/80">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-neutral-500 uppercase flex items-center gap-1">
                                <Clock className="w-3 h-3 text-rose-400" />
                                Aturan Jadwal
                              </span>
                              <button
                                onClick={() => handleOpenScheduleModal(channel)}
                                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold underline flex items-center gap-0.5 transition cursor-pointer"
                                title="Atur frekuensi publikasi kustom, waktu harian & zona waktu"
                              >
                                Sesuaikan
                              </button>
                            </div>
                            <div className="font-semibold text-neutral-200 text-xs flex items-center gap-1.5 pt-0.5 truncate">
                              <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 text-[11px]">
                                {channel.scheduleConfig?.videosPerDay || channel.publishFrequency}
                              </span>
                              <span className="text-neutral-300 text-[11px] truncate">
                                {channel.scheduleConfig?.times?.join(', ') || channel.publishTime}
                              </span>
                              <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                                ({channel.scheduleConfig?.timezone === 'Asia/Jakarta' ? 'WIB' : channel.scheduleConfig?.timezone || channel.timezone || 'WIB'})
                              </span>
                            </div>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-neutral-500 uppercase">Sinkron Terakhir</span>
                            <div className="font-medium text-neutral-400 text-[11px]">
                              {channel.lastSyncAt
                                ? new Date(channel.lastSyncAt).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Belum Pernah'}
                            </div>
                          </div>
                        </div>

                        {/* Two Main Action Buttons directly visible */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/60">
                          <button
                            onClick={() => setSelectedChannelForCandidates(channel)}
                            className="py-2.5 px-3 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 hover:text-cyan-200 text-xs font-semibold border border-cyan-800/60 hover:border-cyan-700 transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                            title="Deteksi video kandidat baru dan periksa batas tanggal"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="truncate">Deteksi Kandidat</span>
                          </button>

                          <button
                            onClick={() => onNavigateToAutomation(channel.id)}
                            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-red-900/30 text-center transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                            title="Buka panel otomasi untuk channel ini"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span className="truncate">Otomasi Channel</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sync Result Details Modal */}
      {syncResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-100">YouTube Synchronization Report</h3>
                  <p className="text-xs text-neutral-400">Target Channel: {syncResultModal.channelTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setSyncResultModal(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Read-only affirmation */}
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-[11px] flex items-center justify-between">
                <span>AMG Read-Only Mode enforced. Fetched real YouTube metadata without applying mutations.</span>
                <span className="font-mono text-[10px] bg-amber-900/50 px-2 py-0.5 rounded font-bold uppercase">Safe Verification</span>
              </div>

              {/* Channel metadata cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">YouTube Channel ID</span>
                  <div className="font-mono font-bold text-neutral-200 mt-0.5 truncate" title={syncResultModal.youtubeChannelId}>
                    {syncResultModal.youtubeChannelId}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Uploads Playlist</span>
                  <div className="font-mono font-bold text-neutral-200 mt-0.5 truncate" title={syncResultModal.uploadPlaylistId || 'N/A'}>
                    {syncResultModal.uploadPlaylistId || 'N/A'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Diambil dari YouTube</span>
                  <div className="font-bold text-emerald-400 mt-0.5">
                    {syncResultModal.actualFetchedFromYouTube} Video
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Belum Dikelola (Menunggu)</span>
                  <div className="font-bold text-amber-400 mt-0.5">
                    {syncResultModal.newUnmanaged} Video
                  </div>
                </div>
              </div>

              {/* Sample Videos List */}
              <div className="space-y-2">
                <h4 className="font-bold text-neutral-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-red-500" />
                  Video Riil yang Ditemukan di Channel YouTube
                </h4>

                {syncResultModal.sampleVideos && syncResultModal.sampleVideos.length > 0 ? (
                  <div className="rounded-xl border border-neutral-800 overflow-hidden">
                    <table className="w-full text-left text-xs text-neutral-300">
                      <thead className="bg-neutral-950 text-[10px] text-neutral-400 uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Judul & ID Video</th>
                          <th className="py-2.5 px-3">Privasi</th>
                          <th className="py-2.5 px-3">Pemrosesan</th>
                          <th className="py-2.5 px-3">Waktu Terjadwal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/60 bg-neutral-900/40">
                        {syncResultModal.sampleVideos.map((v) => (
                          <tr key={v.id} className="hover:bg-neutral-800/30">
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-neutral-200 truncate max-w-[260px]">
                                {v.title}
                              </div>
                              <div className="font-mono text-[10px] text-neutral-500">
                                ID: {v.id} • {v.definition ? v.definition.toUpperCase() : 'HD'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                                  v.privacyStatus === 'private'
                                    ? 'bg-amber-950/80 text-amber-300'
                                    : v.privacyStatus === 'unlisted'
                                    ? 'bg-blue-950/80 text-blue-300'
                                    : 'bg-emerald-950/80 text-emerald-300'
                                }`}
                              >
                                {v.privacyStatus === 'private' ? 'Pribadi' : v.privacyStatus === 'unlisted' ? 'Tidak Publik' : 'Publik'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-400">
                              {v.uploadStatus || 'processed'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-400">
                              {v.publishAt ? new Date(v.publishAt).toLocaleString() : 'Tidak Ada (Pribadi)'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-neutral-950 text-neutral-500 text-center">
                    Belum ada video yang dikembalikan oleh YouTube Data API untuk channel ini.
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSyncResultModal(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold cursor-pointer"
                >
                  Tutup Laporan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Test Connection Modal */}
      {testConnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Diagnostik Koneksi Langsung
              </h3>
              <button
                onClick={() => setTestConnModal(null)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-400">Channel</span>
                  <span className="font-bold text-neutral-200">{testConnModal.channelTitle}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-400">YouTube Channel ID</span>
                  <span className="font-mono text-neutral-200">{testConnModal.youtubeChannelId}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-400">Status OAuth</span>
                  <div>{renderStatusBadge(testConnModal.status)}</div>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-400">Akun Terotorisasi</span>
                  <span className="text-neutral-200">{testConnModal.accountEmail || 'Belum terdaftar'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-400">Token Aktif Ada</span>
                  <span className={testConnModal.hasActiveOAuthToken ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                    {testConnModal.hasActiveOAuthToken ? 'YA (Aktif)' : 'TIDAK'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-400">YouTube Langsung Terhubung</span>
                  <span className={testConnModal.liveChannelAccessible ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {testConnModal.liveChannelAccessible ? 'YA (Dapat Diakses)' : 'TIDAK DAPAT DIHUBUNGI'}
                  </span>
                </div>
                {testConnModal.error && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-900/50 text-rose-300 text-[11px]">
                    {testConnModal.error}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setTestConnModal(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Channel Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Tv className="w-4 h-4 text-red-500" />
                Tambah Channel YouTube Baru
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddChannel} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Nama Tampilan Channel
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="contoh: Ayam Warna Series"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  YouTube Channel ID
                </label>
                <input
                  type="text"
                  required
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  placeholder="contoh: UCxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 font-mono focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              {/* Niche Category and Visual Badge Selector */}
              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-neutral-200 uppercase tracking-wider">
                    Kategorisasi & Pengelompokan Niche
                  </label>
                  <NicheBadge
                    category={newNicheCategory === 'CUSTOM' ? (newCustomNiche || 'Custom') : newNicheCategory}
                    badgeKey={newNicheBadge}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">
                  Pilih preset niche atau tentukan kustom untuk mengisolasi template rotasi, matriks judul, dan pengelompokan dasbor.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Preset Niche</label>
                    <select
                      value={newNicheCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewNicheCategory(val);
                        const matched = NICHE_PRESETS.find((p) => p.category === val);
                        if (matched) {
                          setNewNicheBadge(matched.badgeKey);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
                    >
                      {NICHE_PRESETS.map((p) => (
                        <option key={p.category} value={p.category}>
                          {p.label}
                        </option>
                      ))}
                      <option value="CUSTOM">+ Kategori Niche Kustom...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Warna Aksen Lencana</label>
                    <select
                      value={newNicheBadge}
                      onChange={(e) => setNewNicheBadge(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
                    >
                      <option value="amber">Amber (Kuning Keemasan)</option>
                      <option value="purple">Ungu (Violet)</option>
                      <option value="cyan">Sian (Biru Cerah)</option>
                      <option value="emerald">Zamrud (Hijau Islami)</option>
                      <option value="rose">Mawar (Merah Muda)</option>
                    </select>
                  </div>
                </div>

                {newNicheCategory === 'CUSTOM' && (
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Nama Niche Kustom</label>
                    <input
                      type="text"
                      required
                      value={newCustomNiche}
                      onChange={(e) => setNewCustomNiche(e.target.value)}
                      placeholder="contoh: Cerita Pengantar Tidur, Gaming, dll."
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Tetapkan Profil Konten
                </label>
                <select
                  value={newProfileId}
                  onChange={(e) => setNewProfileId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
                >
                  <option value="">Tanpa Profil (Atur nanti)</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-neutral-300 mb-2 uppercase tracking-wider">
                  Aturan Jadwal & Waktu Tayang Channel
                </label>
                <ScheduleConfigEditor
                  value={newScheduleConfig}
                  onChange={(cfg) => {
                    setNewScheduleConfig(cfg);
                    setNewFrequency(`${cfg.videosPerDay}/day`);
                    setNewPublishTime(cfg.times.join(', '));
                    setNewTimezone(cfg.timezone);
                  }}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold cursor-pointer"
                >
                  {isAdding ? 'Menyimpan...' : 'Simpan Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channel Custom Scheduling Modal */}
      {selectedChannelForSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden my-8">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="text-sm font-bold text-neutral-100">
                    Konfigurasi Aturan Jadwal Kustom — {selectedChannelForSchedule.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Atur frekuensi khusus, multi jam tayang harian, dan titik jangkar jadwal tanpa tabrakan.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedChannelForSchedule(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
              {/* Profile Context Banner */}
              {selectedChannelForSchedule.contentProfileId && (
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-400 font-semibold">Profil Ditautkan:</span>{' '}
                    <span className="text-zinc-200 font-bold">
                      {profiles.find((p) => p.id === selectedChannelForSchedule.contentProfileId)?.name || 'Default'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUseProfileScheduleState(false)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                        !useProfileScheduleState
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      Kustomisasi Khusus Channel
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseProfileScheduleState(true)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                        useProfileScheduleState
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      Ikuti Standar Profil
                    </button>
                  </div>
                </div>
              )}

              {/* Scheduling Config Editor */}
              <ScheduleConfigEditor
                value={scheduleConfigState}
                onChange={handleUpdateScheduleConfigInModal}
                disabled={isSavingSchedule}
                isProfileInherited={useProfileScheduleState}
                onToggleUseProfile={(val) => setUseProfileScheduleState(val)}
                profileScheduleConfig={profiles.find((p) => p.id === selectedChannelForSchedule.contentProfileId)?.scheduleConfig}
              />

              {/* Live Resolved Next Slots Table */}
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-rose-400" />
                    Pratinjau Slot Publikasi Berikutnya ({schedulePreviewSlots.length} slot)
                  </h4>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Melanjutkan dari video terjadwal YouTube terkini (tanpa tabrakan)
                  </span>
                </div>

                {isLoadingSchedulePreview ? (
                  <div className="py-6 text-center text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto text-rose-500 mb-1" />
                    Menghitung slot bebas tabrakan...
                  </div>
                ) : schedulePreviewSlots.length === 0 ? (
                  <div className="py-4 text-center text-zinc-500">
                    Belum ada slot yang dibuat. Periksa konfigurasi jam tayang.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                    {schedulePreviewSlots.map((slot, idx) => (
                      <div
                        key={idx}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 hover:border-zinc-700 transition"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                          <span className="font-mono font-bold">Slot #{slot.index}</span>
                          <span className="text-emerald-400 font-semibold">{slot.timezoneAbbreviation || 'WIB'}</span>
                        </div>
                        <div className="font-bold text-zinc-100 text-xs">{slot.dateString}</div>
                        <div className="font-mono font-bold text-rose-400 text-sm">{slot.timeString}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">
                Prioritas: 1. Kustomisasi Channel &gt; 2. Jadwal Profil &gt; 3. Standar AMG
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedChannelForSchedule(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSavingSchedule}
                  onClick={handleSaveChannelSchedule}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition shadow-lg shadow-rose-950/30 cursor-pointer"
                >
                  {isSavingSchedule ? 'Menyimpan...' : 'Simpan Aturan Jadwal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* YouTube OAuth Connection Modal */}
      <YouTubeOAuthModal
        channel={selectedChannelForOAuth}
        isOpen={!!selectedChannelForOAuth}
        onClose={() => setSelectedChannelForOAuth(null)}
        onConnected={() => {
          onChannelUpdated();
        }}
      />

      {/* Candidate Detection Modal */}
      {selectedChannelForCandidates && (
        <CandidateDetectionModal
          isOpen={!!selectedChannelForCandidates}
          onClose={() => setSelectedChannelForCandidates(null)}
          channel={selectedChannelForCandidates}
          onCandidatesUpdated={() => {
            onChannelUpdated();
          }}
        />
      )}

      {/* Channel Eligibility Configuration Modal */}
      {selectedChannelForEligibility && (
        <ChannelEligibilityModal
          isOpen={!!selectedChannelForEligibility}
          onClose={() => setSelectedChannelForEligibility(null)}
          channel={selectedChannelForEligibility}
          onUpdated={() => {
            onChannelUpdated();
          }}
        />
      )}
    </div>
  );
};
