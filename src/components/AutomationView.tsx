import React, { useState, useEffect } from 'react';
import {
  PlayCircle,
  Eye,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CheckCircle2,
  Calendar,
  Sparkles,
  History,
  FileCheck,
  Sliders,
  UserCheck,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Channel, ContentProfile, AutomationBatch, AutomationPreviewItem, AutomationScopeSummary } from '../types/index.ts';
import { api } from '../services/api.ts';
import { Phase2AcceptanceModal } from './Phase2AcceptanceModal.tsx';
import { CandidateDetectionModal } from './CandidateDetectionModal.tsx';
import { ChannelEligibilityModal } from './ChannelEligibilityModal.tsx';
import { QueueMonitor } from './QueueMonitor.tsx';
import { NicheBadge } from '../utils/nicheCategories';

interface AutomationViewProps {
  channels: Channel[];
  profiles: ContentProfile[];
  initialChannelId?: string;
  onAutomationTriggered: () => void;
  onNavigateToQueue: () => void;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  channels,
  profiles,
  initialChannelId,
  onAutomationTriggered,
  onNavigateToQueue,
}) => {
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    initialChannelId || channels[0]?.id || 'chan-ayam-warna'
  );
  const [previewItems, setPreviewItems] = useState<AutomationPreviewItem[]>([]);
  const [scopeSummary, setScopeSummary] = useState<AutomationScopeSummary | null>(null);
  const [batches, setBatches] = useState<AutomationBatch[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<AutomationBatch | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'INCLUDED' | 'UNCLASSIFIED' | 'EXCLUDED'>('ALL');
  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [rollingBackBatchId, setRollingBackBatchId] = useState<string | null>(null);
  const [batchToRollback, setBatchToRollback] = useState<AutomationBatch | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];
  const selectedProfile = profiles.find((p) => p.id === selectedChannel?.contentProfileId);

  const fetchPreview = async (channelId: string) => {
    setIsLoadingPreview(true);
    setPreviewError(null);
    setDryRunResult(null);
    setExecutionMessage(null);
    try {
      const res = await api.getAutomationPreview(channelId);
      if (res.success && res.preview) {
        setPreviewItems(res.preview);
        if (res.scopeSummary) {
          setScopeSummary(res.scopeSummary);
        }
      }
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to generate automation preview.');
      setPreviewItems([]);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await api.getAutomationBatches();
      setBatches(res);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    }
  };

  useEffect(() => {
    if (selectedChannelId) {
      fetchPreview(selectedChannelId);
    }
    fetchBatches();
  }, [selectedChannelId]);

  const includedItems = previewItems.filter(p => p.managementScope === 'REGULAR' && p.isAmgEligible);
  const unclassifiedItems = previewItems.filter(p => p.managementScope === 'UNCLASSIFIED');
  const excludedItems = previewItems.filter(p => p.managementScope === 'EXCLUDED');

  const visiblePreviewItems = previewItems.filter(item => {
    if (previewFilter === 'INCLUDED') return item.managementScope === 'REGULAR' && item.isAmgEligible;
    if (previewFilter === 'UNCLASSIFIED') return item.managementScope === 'UNCLASSIFIED';
    if (previewFilter === 'EXCLUDED') return item.managementScope === 'EXCLUDED';
    return true;
  });

  const handleRunDryRun = async () => {
    setIsDryRunning(true);
    setDryRunResult(null);
    try {
      const res = await api.executeDryRun(selectedChannelId);
      if (res.success) {
        setDryRunResult(res.batch);
        fetchBatches();
      }
    } catch (err: any) {
      alert(err.message || 'Dry run failed');
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleStartAutomation = async () => {
    setIsExecuting(true);
    setShowConfirmModal(false);
    try {
      const res = await api.startBatchAutomation(selectedChannelId);
      if (res.success) {
        setExecutionMessage(
          `Batch ${res.batch.batchNumber} successfully launched into Phase 3 Worker Queue! Pre-mutation snapshots created.`
        );
        onAutomationTriggered();
        fetchBatches();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to launch automation batch');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEmergencyRollback = async (batchId: string) => {
    setRollingBackBatchId(batchId);
    try {
      const res = await api.emergencyRollbackBatch(batchId);
      if (res.success) {
        setExecutionMessage(
          `Emergency Rollback Completed: Restored ${res.restoredCount} videos in batch ${batchId} to their original pre-mutation titles & private status.`
        );
        setBatchToRollback(null);
        await fetchBatches();
        await fetchPreview(selectedChannelId);
        onAutomationTriggered();
      }
    } catch (err: any) {
      alert(err.message || 'Emergency Rollback failed');
    } finally {
      setRollingBackBatchId(null);
    }
  };

  const handleEnrollItem = async (videoId: string) => {
    setIsEnrolling(true);
    try {
      await api.enrollCandidate(videoId);
      await fetchPreview(selectedChannelId);
      onAutomationTriggered();
    } catch (err: any) {
      alert(err.message || 'Failed to enroll candidate');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleExcludeItem = async (videoId: string) => {
    setIsEnrolling(true);
    try {
      await api.rejectCandidate(videoId, 'Manually excluded by user in preview');
      await fetchPreview(selectedChannelId);
      onAutomationTriggered();
    } catch (err: any) {
      alert(err.message || 'Failed to exclude candidate');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleEnrollAllCandidates = async () => {
    setIsEnrolling(true);
    try {
      const res = await api.enrollAllCandidates(selectedChannelId);
      setExecutionMessage(`Enrolled ${res.enrolledCount} candidate(s) into AMG Regular Scope.`);
      await fetchPreview(selectedChannelId);
      onAutomationTriggered();
    } catch (err: any) {
      alert(err.message || 'Failed to enroll candidates');
    } finally {
      setIsEnrolling(false);
    }
  };

  const getScopeBadge = (scope?: string, isEligible?: boolean) => {
    if (scope === 'REGULAR' && isEligible) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/60 shadow-sm">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          INCLUDED
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

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <PlayCircle className="w-6 h-6 text-red-500" />
            Mesin Otomasi AMG
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Judul Master Deterministik, Thumbnail Master, dan Penjadwalan Berkelanjutan YouTube dengan Proteksi Lingkup Ketat.
          </p>
        </div>

        {/* Channel Selector & Phase 2 Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAcceptanceModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-800/80 text-red-300 font-bold text-xs shadow transition cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-red-400" />
            <span>Suite Pengujian Phase 2</span>
          </button>

          <button
            onClick={() => setShowCandidateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 font-bold text-xs shadow transition cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <span>Deteksi Kandidat</span>
          </button>

          <button
            onClick={() => setShowEligibilityModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold text-xs shadow transition cursor-pointer"
            title="Konfigurasi jendela hari kelayakan, pola, dan tanggal cutoff"
          >
            <Sliders className="w-4 h-4 text-neutral-400" />
            <span>Aturan Kelayakan</span>
          </button>

          <div className="flex items-center space-x-1 pl-2 border-l border-neutral-800">
            <span className="text-xs font-semibold text-neutral-400 uppercase">Target:</span>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.unmanagedVideoCount || 0} belum dikelola)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Phase 3 Worker Queue Monitor Widget */}
      <QueueMonitor />

      {/* Scope Protection Inspection Banner (Requirement 11) */}
      <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 text-xs space-y-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">
              Inspeksi Proteksi Lingkup
            </span>
          </div>
          <div className="text-[11px] text-neutral-400">
            Pemeriksaan Keamanan Ketat: Video yang dikecualikan & belum ditentukan diblokir keras dari modifikasi YouTube.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* INCLUDED */}
          <div
            onClick={() => setPreviewFilter(previewFilter === 'INCLUDED' ? 'ALL' : 'INCLUDED')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              previewFilter === 'INCLUDED'
                ? 'bg-emerald-950/40 border-emerald-600 ring-1 ring-emerald-500'
                : 'bg-neutral-950/60 border-neutral-800/80 hover:border-emerald-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                TERMASUK (LAYAK)
              </span>
              <span className="text-lg font-black text-emerald-400">
                {scopeSummary?.includedCount ?? includedItems.length} video
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Konten AMG Reguler yang layak untuk judul, thumbnail & penjadwalan kontinu.
            </p>
          </div>

          {/* NEEDS SCOPE ASSIGNMENT */}
          <div
            onClick={() => setPreviewFilter(previewFilter === 'UNCLASSIFIED' ? 'ALL' : 'UNCLASSIFIED')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              previewFilter === 'UNCLASSIFIED'
                ? 'bg-amber-950/40 border-amber-600 ring-1 ring-amber-500'
                : 'bg-neutral-950/60 border-neutral-800/80 hover:border-amber-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                PERLU PENENTUAN LINGKUP
              </span>
              <span className="text-lg font-black text-amber-400">
                {scopeSummary?.needsScopeAssignmentCount ?? unclassifiedItems.length} video
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Terlindungi: Video privat menunggu persetujuan eksplisit Anda sebelum masuk otomasi.
            </p>
          </div>

          {/* EXCLUDED */}
          <div
            onClick={() => setPreviewFilter(previewFilter === 'EXCLUDED' ? 'ALL' : 'EXCLUDED')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              previewFilter === 'EXCLUDED'
                ? 'bg-neutral-800/60 border-neutral-500 ring-1 ring-neutral-400'
                : 'bg-neutral-950/60 border-neutral-800/80 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-300 flex items-center gap-1.5">
                <ShieldX className="w-3.5 h-3.5 text-neutral-400" />
                DIKECUALIKAN (TERLINDUNGI)
              </span>
              <span className="text-lg font-black text-neutral-300">
                {scopeSummary?.excludedCount ?? excludedItems.length} video
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              Video pribadi/lama yang dijamin tidak akan diubah atau dijadwalkan ulang.
            </p>
          </div>
        </div>
      </div>

      {/* Channel & Schedule Information Card */}
      {selectedChannel && (
        <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 text-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-400" />
              <span className="font-bold text-neutral-200 uppercase tracking-wider text-[11px]">
                Aturan Jadwal Aktif & Batas Rotasi
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                {selectedChannel.useProfileSchedule && selectedProfile
                  ? 'Diwarisi dari Profil'
                  : selectedChannel.scheduleConfig
                  ? 'Kustomisasi Channel'
                  : 'Profil / Standar'}
              </span>
              <NicheBadge category={selectedChannel.nicheCategory} badgeKey={selectedChannel.nicheBadge} />
            </div>
            <div className="text-[11px] text-zinc-400">
              Kursor AMG Reguler Terakhir:{' '}
              <span className="font-mono text-zinc-200">
                {selectedChannel.lastScheduledPublishAt
                  ? new Date(selectedChannel.lastScheduledPublishAt).toLocaleDateString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Belum Ada (Dimulai dari Slot Tersedia Berikutnya)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Batasan Niche & Rotasi</div>
              <div className="text-xs font-bold text-neutral-200 mt-0.5 flex items-center gap-1.5">
                <span>{selectedChannel.nicheCategory || 'General'}</span>
                <span className="text-[10px] font-mono text-emerald-400 font-normal">(TERISOLASI)</span>
              </div>
            </div>

            <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Frekuensi Publikasi</div>
              <div className="text-sm font-bold text-rose-400 mt-0.5">
                {selectedChannel.scheduleConfig?.videosPerDay || selectedChannel.publishFrequency} Video / Hari
              </div>
            </div>

            <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Waktu Publikasi Harian</div>
              <div className="text-xs font-mono font-bold text-zinc-200 mt-0.5 truncate">
                {selectedChannel.scheduleConfig?.times?.join(', ') || selectedChannel.publishTime}
              </div>
            </div>

            <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
              <div className="text-[10px] uppercase font-semibold text-zinc-500">Zona Waktu Channel</div>
              <div className="text-xs font-bold text-zinc-200 mt-0.5">
                {selectedChannel.scheduleConfig?.timezone || selectedChannel.timezone || 'Asia/Jakarta'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Execution Results or Error */}
      {executionMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            {executionMessage}
          </span>
          <button
            onClick={onNavigateToQueue}
            className="px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs ml-3"
          >
            Lihat Antrean Aktif →
          </button>
        </div>
      )}

      {dryRunResult && (
        <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 text-blue-300 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <strong>Simulasi Dry Run Berhasil ({dryRunResult.batchNumber}):</strong>{' '}
            {dryRunResult.detectedCount} video AMG Reguler divalidasi, nol konflik judul, jadwal kontinu terverifikasi dari jangkar YouTube riil. Video dikecualikan & belum ditentukan tetap terlindungi aman. Nol mutasi YouTube langsung dilakukan.
          </span>
          <button
            onClick={() => setDryRunResult(null)}
            className="text-xs text-blue-400 hover:text-white"
          >
            Tutup
          </button>
        </div>
      )}

      {previewError && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{previewError}</span>
        </div>
      )}

      {/* Preview Section & Action Bar */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-neutral-800">
          <div>
            <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <Eye className="w-4 h-4 text-red-500" />
              Pratinjau Otomasi Pra-Eksekusi ({visiblePreviewItems.length} Video Ditampilkan)
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Tinjau penentuan judul deterministik, thumbnail, dan tanggal jadwal. Hanya video TERMASUK yang akan dimodifikasi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDryRun}
              disabled={isDryRunning || includedItems.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-semibold border border-neutral-700 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDryRunning ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isDryRunning ? 'Mensimulasikan...' : 'Jalankan Dry Run'}</span>
            </button>

            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={includedItems.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-red-900/30 transition active:scale-95 cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Konfirmasi & Mulai Otomasi ({includedItems.length})</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Nama Unggahan Mentah</th>
                <th className="py-2.5 px-3">Lingkup Kelola</th>
                <th className="py-2.5 px-3">Judul Master Diterapkan</th>
                <th className="py-2.5 px-3">Thumbnail Master</th>
                <th className="py-2.5 px-3">Tanggal & Waktu Tayang</th>
                <th className="py-2.5 px-3">Status Lingkup</th>
                <th className="py-2.5 px-3 text-right">Kelayakan & Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {isLoadingPreview ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-red-500 mb-2" />
                    Menghitung pratinjau deterministik & memverifikasi proteksi lingkup...
                  </td>
                </tr>
              ) : visiblePreviewItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    Tidak ada video yang cocok dalam filter ini.
                  </td>
                </tr>
              ) : (
                visiblePreviewItems.map((item) => (
                  <tr key={item.videoId} className="hover:bg-neutral-800/30 transition">
                    <td className="py-3 px-3 font-mono font-bold text-neutral-400">
                      {item.sequence}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-neutral-300 max-w-[180px] truncate">
                        {item.originalTitle}
                      </div>
                      {item.exclusionReason && (
                        <div className="text-[10px] text-neutral-500 italic truncate max-w-[180px]">
                          {item.exclusionReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getScopeBadge(item.managementScope, item.isAmgEligible)}
                    </td>
                    <td className="py-3 px-3 max-w-[220px]">
                      {item.managementScope === 'REGULAR' && item.isAmgEligible ? (
                        <div className="font-semibold text-emerald-400 truncate">
                          {item.assignedTitle}
                        </div>
                      ) : (
                        <span className="text-neutral-500 italic">{item.assignedTitle}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {item.assignedThumbnail && (
                          <img
                            src={item.assignedThumbnail}
                            alt=""
                            className="w-12 h-8 rounded object-cover border border-neutral-700"
                          />
                        )}
                        <span className="text-[11px] text-neutral-300">
                          {item.managementScope === 'REGULAR' && item.isAmgEligible
                            ? `TH${((item.sequence - 1) % 4) + 1}`
                            : 'Asli'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono text-neutral-200 font-medium">
                        {item.publishDate} — {item.publishTime}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          item.status === 'READY'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800/40'
                            : item.status === 'NEEDS_SCOPE'
                            ? 'bg-amber-950 text-amber-400 border-amber-800/40'
                            : item.status === 'BLOCKED_EXCLUDED'
                            ? 'bg-neutral-900 text-neutral-400 border-neutral-700'
                            : 'bg-blue-950 text-blue-400 border-blue-800/40'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {item.managementScope === 'REGULAR' && item.isAmgEligible ? (
                        <button
                          onClick={() => handleExcludeItem(item.videoId)}
                          disabled={isEnrolling}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
                        >
                          Kecualikan
                        </button>
                      ) : item.managementScope === 'EXCLUDED' ? (
                        <button
                          onClick={() => handleEnrollItem(item.videoId)}
                          disabled={isEnrolling}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-neutral-800 hover:bg-emerald-900 text-neutral-400 hover:text-emerald-300 transition cursor-pointer"
                        >
                          Masukkan Kembali
                        </button>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEnrollItem(item.videoId)}
                            disabled={isEnrolling}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white transition shadow cursor-pointer"
                          >
                            Daftarkan ke AMG
                          </button>
                          <button
                            onClick={() => handleExcludeItem(item.videoId)}
                            disabled={isEnrolling}
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-400 transition cursor-pointer"
                          >
                            Kecualikan
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Automation Batches History */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <History className="w-4 h-4 text-neutral-400" />
            Riwayat Batch Otomasi
          </h3>
          <span className="text-xs text-neutral-400">{batches.length} Batch Tercatat</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">Nomor Batch</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Diproses</th>
                <th className="py-2.5 px-3">Waktu Mulai</th>
                <th className="py-2.5 px-3">Waktu Selesai</th>
                <th className="py-2.5 px-3 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {batches.map((batch) => {
                const isRollingBack = rollingBackBatchId === batch.id;
                const isRolledBack = (batch as any).isRolledBack;

                return (
                  <tr key={batch.id} className="hover:bg-neutral-800/30 transition">
                    <td className="py-3 px-3 font-mono font-bold text-neutral-100">
                      {batch.batchNumber}
                    </td>
                    <td className="py-3 px-3">{batch.channelTitle || 'Ayam Warna'}</td>
                    <td className="py-3 px-3">
                      {batch.isDryRun ? (
                        <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/40 text-[10px] font-bold">
                          DRY RUN
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 text-[10px] font-bold">
                          EKSEKUSI LANGSUNG
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            batch.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-400'
                              : batch.status === 'running'
                              ? 'bg-amber-950 text-amber-400 animate-pulse'
                              : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          {batch.status === 'completed'
                            ? 'SELESAI'
                            : batch.status === 'running'
                            ? 'BERJALAN'
                            : batch.status}
                        </span>
                        {isRolledBack && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-neutral-800 text-purple-300 border border-purple-800/60">
                            DIPULIHKAN
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {batch.completedCount}/{batch.detectedCount} video
                    </td>
                    <td className="py-3 px-3 text-neutral-400">
                      {new Date(batch.startedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3 text-neutral-400">
                      {batch.completedAt
                        ? new Date(batch.completedAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Sedang Berjalan'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!batch.isDryRun && !isRolledBack ? (
                        <button
                          onClick={() => setBatchToRollback(batch)}
                          disabled={isRollingBack}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 transition cursor-pointer active:scale-95 disabled:opacity-50"
                          title="Pulihkan seluruh video pada batch ini ke metadata awal dan status privat"
                        >
                          <RotateCcw className={`w-3 h-3 text-rose-400 ${isRollingBack ? 'animate-spin' : ''}`} />
                          <span>{isRollingBack ? 'Memulihkan...' : 'Pemulihan Darurat'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-neutral-500 font-mono">
                          {isRolledBack ? 'Dipulihkan' : 'N/A'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Confirm Batch Execution
              </h3>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-neutral-300">
              <p className="leading-relaxed">
                You are about to launch automated processing for{' '}
                <strong className="text-emerald-400">{includedItems.length} AMG Regular videos</strong> on channel{' '}
                <strong className="text-white">"{selectedChannel?.title}"</strong>.
              </p>

              {(unclassifiedItems.length > 0 || excludedItems.length > 0) && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Strict Scope Protection Active:
                  </div>
                  <div>
                    • <strong>{excludedItems.length} Excluded videos</strong> will be untouched.
                  </div>
                  <div>
                    • <strong>{unclassifiedItems.length} Unclassified videos</strong> will NOT be processed until you assign them to AMG Regular in Video Catalog.
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5 text-[11px]">
                <div className="font-semibold text-neutral-200">Execution Plan:</div>
                <ul className="list-disc list-inside space-y-1 text-neutral-400">
                  <li>Verify managementScope === 'REGULAR' & isAmgEligible === true</li>
                  <li>Validate HD transcoding completion on YouTube</li>
                  <li>Apply Master Titles via deterministic round-robin</li>
                  <li>Upload Master Thumbnails via independent rotation</li>
                  <li>Continuous schedule continuation starting from next available slot</li>
                  <li>Verify changes and record in AMG Activity Logs</li>
                </ul>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartAutomation}
                  disabled={isExecuting || includedItems.length === 0}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-900/30"
                >
                  {isExecuting ? 'Launching...' : `Yes, Start Automation (${includedItems.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2 Modals */}
      {batchToRollback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-rose-950/40">
              <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Emergency Rollback Batch {batchToRollback.batchNumber}
              </h3>
              <button
                onClick={() => setBatchToRollback(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-neutral-300">
              <p className="leading-relaxed">
                This action will immediately restore all videos modified by batch{' '}
                <strong className="text-white font-mono">{batchToRollback.batchNumber}</strong> back to their exact original pre-mutation titles and reset their privacy status back to{' '}
                <strong className="text-amber-400">private</strong>.
              </p>

              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5 text-[11px]">
                <div className="font-semibold text-neutral-200">Rollback Specifications:</div>
                <ul className="list-disc list-inside space-y-1 text-neutral-400">
                  <li>Original title restored from pre-mutation snapshot</li>
                  <li>Original privacy status restored (private)</li>
                  <li>Videos returned to Enrolled / Unscheduled state</li>
                  <li>Pending & retrying jobs for this batch will be cancelled</li>
                </ul>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBatchToRollback(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleEmergencyRollback(batchToRollback.id)}
                  disabled={rollingBackBatchId === batchToRollback.id}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-900/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${rollingBackBatchId === batchToRollback.id ? 'animate-spin' : ''}`} />
                  <span>{rollingBackBatchId === batchToRollback.id ? 'Restoring...' : 'Confirm Rollback'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2 Modals */}
      {showAcceptanceModal && selectedChannel && (
        <Phase2AcceptanceModal
          isOpen={showAcceptanceModal}
          onClose={() => setShowAcceptanceModal(false)}
          channelId={selectedChannel.id}
          channelTitle={selectedChannel.title}
        />
      )}

      {showCandidateModal && selectedChannel && (
        <CandidateDetectionModal
          isOpen={showCandidateModal}
          onClose={() => setShowCandidateModal(false)}
          channel={selectedChannel}
          onCandidatesUpdated={() => {
            fetchPreview(selectedChannelId);
            onAutomationTriggered();
          }}
        />
      )}

      {showEligibilityModal && selectedChannel && (
        <ChannelEligibilityModal
          isOpen={showEligibilityModal}
          onClose={() => setShowEligibilityModal(false)}
          channel={selectedChannel}
          onUpdated={() => {
            fetchPreview(selectedChannelId);
            onAutomationTriggered();
          }}
        />
      )}
    </div>
  );
};
