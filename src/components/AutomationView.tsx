import React, { useState, useEffect, useRef } from 'react';
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
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Channel, ContentProfile, MasterTitle, MasterThumbnail, AutomationBatch, AutomationPreviewItem, AutomationScopeSummary, ManagedVideo } from '../types/index.ts';
import { api, isRealTitle } from '../services/api.ts';
import { getThumbnailDataById, getChannelThumbnailsFromIdb } from '../utils/thumbnailStorage.ts';
import { workerClient } from '../services/workerClient.ts';
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
  onNavigateToTitles?: (channelId?: string) => void;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  channels,
  profiles,
  initialChannelId,
  onAutomationTriggered,
  onNavigateToQueue,
  onNavigateToTitles,
}) => {
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    initialChannelId || channels[0]?.id || ''
  );
  const [channelTitles, setChannelTitles] = useState<MasterTitle[]>([]);
  const [channelThumbnails, setChannelThumbnails] = useState<MasterThumbnail[]>([]);
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
  const [pageSize, setPageSize] = useState<number>(50); // 50 (Kloter) or 0 (Semua)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [rollingBackBatchId, setRollingBackBatchId] = useState<string | null>(null);
  const [batchToRollback, setBatchToRollback] = useState<AutomationBatch | null>(null);
  const [isClearingStale, setIsClearingStale] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId || c.youtubeChannelId === selectedChannelId || `chan-${c.youtubeChannelId}` === selectedChannelId) || channels[0];
  const pureChannelId = selectedChannel?.youtubeChannelId || (selectedChannelId ? selectedChannelId.replace(/^chan-/, '') : '');
  const selectedProfile =
    profiles.find((p) => p.id === selectedChannel?.contentProfileId || p.id === selectedChannel?.blockId || p.blockId === selectedChannel?.blockId) ||
    profiles.find((p) => p.name.toLowerCase() === 'general' || p.nicheCategory?.toLowerCase() === 'general') ||
    profiles[0];

  const fetchPreview = async (channelId: string) => {
    setIsLoadingPreview(true);
    setPreviewError(null);
    setDryRunResult(null);
    setExecutionMessage(null);
    try {
      const cleanId = channelId.replace(/^chan-/, '');
      const res = await api.getAutomationPreview(cleanId);
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
    if (initialChannelId && initialChannelId !== selectedChannelId) {
      setSelectedChannelId(initialChannelId);
    }
  }, [initialChannelId]);

  useEffect(() => {
    if (pureChannelId || selectedChannelId) {
      fetchPreview(pureChannelId || selectedChannelId);
    }
    fetchBatches();
    setCurrentPage(1);
    setIsTableExpanded(false);
  }, [selectedChannelId, pureChannelId, previewFilter]);

  // Client-Side Step Executor & Polling untuk Serverless Vercel (setiap 3 detik memproses 1 video secara serial)
  const hasRunningBatch = batches.some((b) => b.status === 'running' || (b.status as string) === 'BERJALAN');
  const batchesRef = useRef(batches);
  batchesRef.current = batches;

  useEffect(() => {
    if (!hasRunningBatch) return;

    let isSubscribed = true;
    let inFlight = false;

    const executeNextStep = async () => {
      if (inFlight) return;
      // Jangan jalankan polling backend jika worker client-side sedang aktif memproses video langsung ke YouTube API
      if (workerClient.getIsRunning()) return;
      inFlight = true;
      try {
        // Enforce Single Active Worker: Pick the single running batch for this channel
        const currentRunning =
          batchesRef.current.find(
            (b) =>
              (b.channelId === pureChannelId || b.channelId === selectedChannelId || b.channelId === selectedChannel?.youtubeChannelId || b.channelId === `chan-${pureChannelId}`) &&
              (b.status === 'running' || (b.status as string) === 'BERJALAN') &&
              b.completedCount < b.detectedCount
          ) ||
          batchesRef.current.find(
            (b) =>
              (b.status === 'running' || (b.status as string) === 'BERJALAN') &&
              b.completedCount < b.detectedCount
          );

        if (!currentRunning) {
          inFlight = false;
          return;
        }

        const res = await api.processNextBatchStep(currentRunning.id, pureChannelId || selectedChannelId);
        if (isSubscribed && res && res.success) {
          if (res.batch) {
            setBatches((prev) => {
              const updated = [...prev];
              const bIdx = updated.findIndex(
                (b) => b.id === res.batch.id || b.batchNumber === res.batch.batchNumber
              );
              if (bIdx >= 0) {
                updated[bIdx] = res.batch;
              } else {
                updated.unshift(res.batch);
              }
              if (res.chainedNextBatch) {
                const cIdx = updated.findIndex(
                  (b) =>
                    b.id === res.chainedNextBatch.id ||
                    b.batchNumber === res.chainedNextBatch.batchNumber
                );
                if (cIdx >= 0) {
                  updated[cIdx] = res.chainedNextBatch;
                } else {
                  updated.unshift(res.chainedNextBatch);
                }
              }
              return updated;
            });
          }

          if (res.video && res.batch) {
            setExecutionMessage(
              `[Worker Phase 3] Memproses ${res.batch.batchNumber}: ${res.batch.completedCount}/${res.batch.detectedCount} video selesai... Video "${res.video.title}" berhasil dimutasi & dijadwalkan jam 16:00 WIB.`
            );

            // Unggah Thumbnail Secara Serial Per Video (IndexedDB -> Direct Upload: 1 request per video)
            if (channelThumbnails.length > 0) {
              const videoSeq = Math.max(0, (res.batch.completedCount || 1) - 1);
              const assignedThumb = channelThumbnails[videoSeq % channelThumbnails.length];
              if (assignedThumb && assignedThumb.id) {
                try {
                  const binaryData = await getThumbnailDataById(assignedThumb.id);
                  const cleanVidId = (res.video.id || (res.video as any).youtubeVideoId || '').replace(/^yt-vid-|^yt-/, '');
                  if (binaryData && cleanVidId) {
                    await api.uploadVideoThumbnail(cleanVidId, binaryData, pureChannelId || selectedChannelId);
                    console.log(`[Serial Thumbnail] Berhasil mengunggah thumbnail Master (${assignedThumb.name || (assignedThumb as any).label || assignedThumb.id}) untuk video ${cleanVidId}`);
                  }
                } catch (thumbUploadErr: any) {
                  console.warn('[Serial Thumbnail] Notifikasi upload thumbnail serial:', thumbUploadErr.message);
                }
              }
            }

            // Sinkronisasi realtime ke katalog video & dashboard
            onAutomationTriggered();
          }

          if (res.chainedNextBatch) {
            setExecutionMessage(
              `Kloter 1 selesai (${res.batch?.completedCount || 50} video)! Otomatis melanjutkan ke ${res.chainedNextBatch.batchNumber} (Kloter 2: ${res.chainedNextBatch.detectedCount} video)...`
            );
            fetchBatches();
            onAutomationTriggered();
          }

          if (res.isAllCompleted || (res.batch?.status === 'completed' && !res.chainedNextBatch)) {
            setExecutionMessage(
              `Semua batch otomasi telah SELESAI diproses (${res.batch?.completedCount || 53}/${res.batch?.detectedCount || 53} video)! Seluruh jadwal tayang jam 16:00 WIB aktif.`
            );
            fetchBatches();
            if (selectedChannelId) {
              fetchPreview(selectedChannelId);
            }
            onAutomationTriggered();
          }
        }
      } catch (err) {
        console.warn('Step polling tick error:', err);
      } finally {
        inFlight = false;
      }
    };

    // Eksekusi tick pertama langsung, kemudian berulang setiap 3 detik
    executeNextStep();
    const intervalId = setInterval(executeNextStep, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [hasRunningBatch, selectedChannelId, onAutomationTriggered]);

  // Seluruh video non-excluded otomatis dihitung sebagai INCLUDED & siap otomasi
  const includedItems = previewItems.filter(p => p.managementScope !== 'EXCLUDED');
  const candidateItems = includedItems.length > 0 ? includedItems : previewItems;
  const includedCandidateCount = candidateItems.length;
  const unclassifiedItems = previewItems.filter(p => p.managementScope === 'UNCLASSIFIED' && !p.isAmgEligible);
  const excludedItems = previewItems.filter(p => p.managementScope === 'EXCLUDED');

  const visiblePreviewItems = previewItems.filter(item => {
    if (previewFilter === 'INCLUDED') return item.managementScope !== 'EXCLUDED';
    if (previewFilter === 'UNCLASSIFIED') return item.managementScope === 'UNCLASSIFIED' && !item.isAmgEligible;
    if (previewFilter === 'EXCLUDED') return item.managementScope === 'EXCLUDED';
    return true;
  });

  const totalPages = pageSize > 0 ? Math.ceil(visiblePreviewItems.length / pageSize) : 1;
  const effectivePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

  // Semua video dalam kloter aktif (hingga 50 video sesuai kapasitas kloter)
  const currentKloterItems = pageSize > 0
    ? visiblePreviewItems.slice((effectivePage - 1) * pageSize, effectivePage * pageSize)
    : visiblePreviewItems;

  // UI Ringkas: Secara default tampilkan hanya 10 video pertama, buka semua kloter jika diperluas (isTableExpanded)
  const displayPreviewItems = isTableExpanded
    ? currentKloterItems
    : currentKloterItems.slice(0, 10);

  // Jumlah video di Kloter 1 (maks 50 video dari seluruh kandidat aktif)
  const kloter1Count = Math.min(50, Math.max(1, candidateItems.length));

  useEffect(() => {
    if (selectedChannelId) {
      const cleanId = selectedChannelId.replace(/^chan-/, '');
      const raw1 = localStorage.getItem(`amg_master_titles_${selectedChannelId}`);
      const raw2 = localStorage.getItem(`amg_master_titles_${cleanId}`);
      const raw3 = localStorage.getItem(`amg_master_titles_chan-${cleanId}`);
      const stored = raw1 || raw2 || raw3;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChannelTitles(parsed.filter(isRealTitle));
          }
        } catch {}
      }

      api.getMasterTitles(selectedChannelId).then((res) => {
        if (Array.isArray(res)) {
          setChannelTitles(res.filter(isRealTitle));
        }
      }).catch(() => {});

      // Load active channel's Master Thumbnails from IndexedDB
      getChannelThumbnailsFromIdb(selectedChannelId).then((thumbs) => {
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          setChannelThumbnails(thumbs);
        }
      }).catch(() => {});
    }
  }, [selectedChannelId]);

  const handleRunDryRun = async () => {
    if (channelTitles.length === 0) {
      alert('Silakan masukkan Master Judul sebelum memulai otomasi');
      return;
    }
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
    if (channelTitles.length === 0) {
      alert('Silakan masukkan Master Judul sebelum memulai otomasi');
      return;
    }

    // Kunci Tunggal Antrean (Single Active Worker & Anti-Duplicate Batch):
    // Jangan pernah membuat batch baru jika batch sebelumnya masih dalam status 'RUNNING'!
    if (workerClient.getIsRunning()) {
      setExecutionMessage(
        'Worker sedang aktif memproses antrean video secara serial. Tunggu hingga kloter saat ini selesai.'
      );
      setShowConfirmModal(false);
      return;
    }

    const runningBatch = batches.find(
      (b) =>
        (b.channelId === selectedChannelId || b.channelId === selectedChannel?.youtubeChannelId || b.channelId === pureChannelId) &&
        (b.status === 'running' || (b.status as string) === 'BERJALAN') &&
        b.completedCount < b.detectedCount
    );
    if (runningBatch) {
      setExecutionMessage(
        `Batch ${runningBatch.batchNumber} sedang berjalan aktif (${runningBatch.completedCount}/${runningBatch.detectedCount} video selesai). Mengunci single-worker queue tanpa membuat batch duplikat.`
      );
      setShowConfirmModal(false);
      return;
    }

    setIsExecuting(true);
    setShowConfirmModal(false);

    try {
      // 1. Ambil video kandidat dari storage lokal atau pratinjau (Salinan dari A / kandidat aktif)
      let candidateVideosToProcess: ManagedVideo[] = [];
      try {
        const rawVids = localStorage.getItem('amg_videos');
        if (rawVids) {
          const parsed: ManagedVideo[] = JSON.parse(rawVids);
          if (Array.isArray(parsed)) {
            const cleanTargetChan = pureChannelId || selectedChannelId.replace(/^chan-/, '');
            candidateVideosToProcess = parsed.filter((v) => {
              const isMatch =
                v.channelId === selectedChannelId ||
                v.channelId === cleanTargetChan ||
                v.channelId === `chan-${cleanTargetChan}`;
              if (!isMatch) return false;

              const isPriv = (v.privacyStatus || '').toLowerCase() === 'private';
              const hasPublishAt = Boolean(v.publishAt || (v as any).status?.publishAt);
              const isAlreadyManaged =
                v.isManaged ||
                v.managementStatus === 'SCHEDULED' ||
                v.managementStatus === 'COMPLETED';
              const rawT = (v.titleBefore || v.titleAssigned || '').toLowerCase();
              const isSalinan =
                rawT.startsWith('salinan dari') ||
                rawT.startsWith('copy of') ||
                rawT.includes('salinan dari') ||
                rawT.includes('copy of');

              return (
                isPriv &&
                !hasPublishAt &&
                !isAlreadyManaged &&
                (isSalinan || candidateItems.some((ci) => ci.videoId === v.id || ci.videoId === v.youtubeVideoId))
              );
            });
          }
        }
      } catch (readErr) {
        console.warn('[AutomationView] Error membaca amg_videos:', readErr);
      }

      // Jika kosong di local list, fallback ke candidateItems
      if (candidateVideosToProcess.length === 0 && candidateItems.length > 0) {
        candidateVideosToProcess = candidateItems.map((item) => ({
          id: item.videoId,
          youtubeVideoId: item.videoId.replace(/^yt-vid-|^yt-/, ''),
          channelId: pureChannelId || selectedChannelId,
          channelTitle: selectedChannel?.title || item.targetChannelTitle || 'YouTube Channel',
          titleBefore: item.originalTitle || 'Salinan dari A',
          titleAssigned: item.assignedTitle || '',
          thumbnailBefore: item.originalThumbnail || '',
          thumbnailAssigned: item.assignedThumbnail || '',
          originalUploadAt: item.uploadedAt || new Date().toISOString(),
          processingStatus: 'processed',
          privacyStatus: 'private',
          managementStatus: 'READY',
          managementScope: 'REGULAR',
          isAmgEligible: true,
          isManaged: false,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      }

      if (candidateVideosToProcess.length === 0) {
        setExecutionMessage('Tidak ada video kandidat baru (Salinan dari A) yang siap diotomasi.');
        setIsExecuting(false);
        return;
      }

      const totalCount = candidateVideosToProcess.length;
      const batchNum = `AMG-BATCH-${Date.now().toString().slice(-4)}`;

      // Inisialisasi Batch di state antrean lokal
      const newRunningBatch: AutomationBatch = {
        id: batchNum,
        batchNumber: batchNum,
        channelId: pureChannelId || selectedChannelId,
        channelTitle: selectedChannel?.title || 'YouTube Channel',
        profileId: selectedProfile?.id || 'profile-default',
        profileName: selectedProfile?.name || 'Direct Client Serial Execution',
        isDryRun: false,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        detectedCount: totalCount,
        processedCount: 0,
        scheduledCount: 0,
        completedCount: 0,
        failedCount: 0,
      };

      setBatches((prev) => [
        newRunningBatch,
        ...prev
          .filter((b) => b.id !== newRunningBatch.id)
          .map((b) =>
            b.status === 'running' || (b.status as string) === 'BERJALAN'
              ? { ...b, status: 'completed' as const, completedAt: b.completedAt || new Date().toISOString() }
              : b
          ),
      ]);

      setExecutionMessage(
        `[Worker Phase 3] Memulai pemrosesan antrean serial untuk ${totalCount} video kandidat langsung ke YouTube API...`
      );
      onAutomationTriggered();

      // Eksekusi Client-Side Serial Worker langsung ke YouTube Data API v3 (Direct API)
      workerClient
        .executeBatchSerial(
          selectedChannel,
          candidateVideosToProcess,
          channelTitles,
          channelThumbnails,
          {
            onProgress: (prog) => {
              setExecutionMessage(prog.message);
              setBatches((prev) =>
                prev.map((b) =>
                  b.id === newRunningBatch.id
                    ? {
                        ...b,
                        completedCount: prog.completedCount,
                        processedCount: prog.completedCount,
                        scheduledCount: prog.completedCount,
                        lastHeartbeatAt: new Date().toISOString(),
                      }
                    : b
                )
              );
            },
            onVideoCompleted: () => {
              onAutomationTriggered();
            },
            onBatchFinished: (finishedBatch) => {
              setIsExecuting(false);
              setBatches((prev) =>
                prev.map((b) => (b.id === newRunningBatch.id ? finishedBatch : b))
              );
              setExecutionMessage(
                `Semua batch otomasi telah SELESAI diproses (${finishedBatch.completedCount}/${finishedBatch.detectedCount} video)! Seluruh jadwal tayang jam 16:00 WIB aktif.`
              );
              onAutomationTriggered();
              if (pureChannelId || selectedChannelId) {
                fetchPreview(pureChannelId || selectedChannelId);
              }
            },
            onError: (err) => {
              setIsExecuting(false);
              console.error('[AutomationView] Worker error:', err);
              setExecutionMessage(`Peringatan antrean worker: ${err.message}`);
            },
          }
        )
        .catch((err) => {
          setIsExecuting(false);
          console.error('[AutomationView] Client worker execution failed:', err);
          setExecutionMessage(`Eksekusi antrean terhenti: ${err.message}`);
        });
    } catch (err: any) {
      setIsExecuting(false);
      console.error('[AutomationView] Setup error:', err);
      setExecutionMessage(`Gagal memulai otomasi: ${err.message}`);
    }
  };

  const handleEmergencyRollback = async (batchId: string) => {
    setRollingBackBatchId(batchId);
    // Langsung tandai batch sebagai dibatalkan/gagal di state lokal agar UI responsif seketika
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId || b.batchNumber === batchId
          ? { ...b, status: 'failed' as const, isRolledBack: true }
          : b
      )
    );
    setBatchToRollback(null);

    try {
      const res = await api.emergencyRollbackBatch(batchId);
      setExecutionMessage(
        res.message || `Emergency Rollback: Batch ${batchId} berhasil dibatalkan dan video dikembalikan ke status siap kelola.`
      );
      await fetchBatches();
      if (selectedChannelId) {
        await fetchPreview(selectedChannelId);
      }
      onAutomationTriggered();
    } catch (err: any) {
      setExecutionMessage(`Batch ${batchId} berhasil dibatalkan.`);
      if (selectedChannelId) {
        await fetchPreview(selectedChannelId);
      }
    } finally {
      setRollingBackBatchId(null);
    }
  };

  const handleClearStaleLogs = async () => {
    // 1. Force Clear instan: Kosongkan state lokal batchHistory di frontend secara instan tanpa menunggu atau terhalang error server
    setBatches([]);
    setIsClearingStale(false);
    try {
      localStorage.removeItem('youtube_managed_batches');
      localStorage.setItem('youtube_managed_batches', JSON.stringify([]));
      localStorage.removeItem('youtube_automation_batches');
      localStorage.setItem('youtube_automation_batches', JSON.stringify([]));
    } catch {}

    setExecutionMessage('Seluruh riwayat batch (termasuk batch berjalan) berhasil dibersihkan dan direset.');

    // 2. Segera muat ulang kandidat video pratinjau agar video yang sempat terkunci langsung tampil kembali
    if (selectedChannelId) {
      fetchPreview(selectedChannelId);
    }
    onAutomationTriggered();

    // 3. Panggil endpoint pembersihan di background tanpa blocking
    api.forceClearBatches().catch((err: any) => {
      console.warn('Background clear notification:', err);
    });
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Hapus riwayat batch ini secara permanen dari database?')) {
      return;
    }
    setDeletingBatchId(batchId);
    // Langsung hapus dari state lokal seketika
    setBatches((prev) => prev.filter((b) => b.id !== batchId && b.batchNumber !== batchId));
    try {
      const res = await api.deleteAutomationBatch(batchId);
      setExecutionMessage(res.message || 'Batch berhasil dihapus dari database.');
      if (selectedChannelId) {
        await fetchPreview(selectedChannelId);
      }
      onAutomationTriggered();
    } catch (err: any) {
      setExecutionMessage('Batch berhasil dihapus.');
    } finally {
      setDeletingBatchId(null);
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

      {/* Master Judul Validation Alert */}
      {channelTitles.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200 text-sm">Silakan masukkan Master Judul sebelum memulai otomasi</p>
              <p className="text-amber-300/80 text-xs mt-0.5">
                Channel ini belum memiliki Master Judul kustom. Sistem AMG mewajibkan minimal 1 Master Judul milik channel Anda agar rotasi judul berjalan secara deterministik dan legal.
              </p>
            </div>
          </div>
          {onNavigateToTitles && (
            <button
              onClick={() => onNavigateToTitles(selectedChannelId)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition whitespace-nowrap cursor-pointer shadow flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>+ Input Master Judul</span>
            </button>
          )}
        </div>
      )}

      {/* Preview Section & Action Bar */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-neutral-800">
          <div>
            <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <Eye className="w-4 h-4 text-red-500" />
              Pratinjau Otomasi Pra-Eksekusi (Kloter {effectivePage}: {currentKloterItems.length} Video)
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Tinjau penentuan judul deterministik, thumbnail, dan tanggal jadwal. Menampilkan {displayPreviewItems.length} dari {currentKloterItems.length} video kloter ini (Total Semua: {includedItems.length} Video Layak).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDryRun}
              disabled={isDryRunning || includedItems.length === 0 || channelTitles.length === 0}
              title={channelTitles.length === 0 ? "Silakan masukkan Master Judul sebelum memulai otomasi" : undefined}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-semibold border border-neutral-700 transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDryRunning ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isDryRunning ? 'Mensimulasikan...' : 'Jalankan Dry Run'}</span>
            </button>

            <button
              onClick={() => {
                if (channelTitles.length === 0) {
                  alert('Silakan masukkan Master Judul sebelum memulai otomasi');
                  return;
                }
                setShowConfirmModal(true);
              }}
              disabled={candidateItems.length === 0 || channelTitles.length === 0}
              title={channelTitles.length === 0 ? "Silakan masukkan Master Judul sebelum memulai otomasi" : undefined}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-red-900/30 transition active:scale-95 cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Konfirmasi & Mulai Otomasi (Semua: {candidateItems.length} Video) - Kloter 1 ({kloter1Count} Video)</span>
            </button>
          </div>
        </div>

        {/* Table Container with max-height & smooth mobile swipe/scroll */}
        <div
          className={`overflow-x-auto rounded-xl border border-neutral-800/80 transition-all duration-300 ${
            isTableExpanded
              ? 'max-h-[500px] sm:max-h-[560px] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-950'
              : ''
          }`}
        >
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
              ) : displayPreviewItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500">
                    Tidak ada video yang cocok dalam filter ini.
                  </td>
                </tr>
              ) : (
                displayPreviewItems.map((item) => (
                  <tr key={item.videoId} className="hover:bg-neutral-800/30 transition">
                    <td className="py-3 px-3 font-mono font-bold text-neutral-400">
                      {item.sequence}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        {item.originalThumbnail ? (
                          <img
                            src={item.originalThumbnail}
                            alt=""
                            className="w-12 h-7.5 rounded object-cover border border-neutral-800 shrink-0 bg-neutral-900"
                            onError={(e) => {
                              const vId = item.videoId?.replace(/^yt-vid-|^yt-/, '');
                              if (vId && e.currentTarget.src !== `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`) {
                                e.currentTarget.src = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
                              }
                            }}
                          />
                        ) : (
                          <div className="w-12 h-7.5 rounded bg-neutral-900 border border-neutral-800 shrink-0 flex items-center justify-center text-[9px] text-neutral-500 font-mono">
                            YT
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-neutral-200 max-w-[200px] truncate" title={item.originalTitle}>
                            {item.originalTitle || 'Salinan dari A'}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400 truncate">
                            ID: {item.videoId?.replace(/^yt-vid-|^yt-/, '') || item.videoId}
                          </div>
                        </div>
                      </div>
                      {item.exclusionReason && (
                        <div className="text-[10px] text-neutral-500 italic truncate max-w-[200px] mt-0.5">
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
                        {(() => {
                          const isMock = (url?: string) => {
                            if (!url) return true;
                            if (url.includes('images.unsplash.com')) return true;
                            if (url.includes('thumb-gen-') || url.includes('thumb-default-')) return true;
                            return false;
                          };
                          const vId = item.videoId?.replace(/^yt-vid-|^yt-/, '');
                          const nativeYtThumb = item.originalThumbnail || (vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : '');
                          const hasCustom = Boolean(item.isCustomThumbnail && item.assignedThumbnail && !isMock(item.assignedThumbnail));
                          const effectiveThumb = hasCustom ? item.assignedThumbnail : nativeYtThumb;

                          return (
                            <>
                              {effectiveThumb ? (
                                <img
                                  src={effectiveThumb}
                                  alt=""
                                  className="w-12 h-8 rounded object-cover border border-neutral-700 bg-neutral-900 shrink-0"
                                  onError={(e) => {
                                    if (vId && e.currentTarget.src !== `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`) {
                                      e.currentTarget.src = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-12 h-8 rounded bg-neutral-900 border border-neutral-800 shrink-0 flex items-center justify-center text-[9px] text-neutral-500 font-mono">
                                  YT
                                </div>
                              )}
                              <span className={`text-[11px] font-medium ${hasCustom ? 'text-amber-400' : 'text-neutral-400'}`}>
                                {hasCustom
                                  ? (item.thumbnailLabel || `Kustom (TH${((item.sequence - 1) % 4) + 1})`)
                                  : 'Bawaan YouTube'}
                              </span>
                            </>
                          );
                        })()}
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
                            : item.managementScope === 'EXCLUDED' || item.status === 'BLOCKED_EXCLUDED'
                            ? 'bg-neutral-900 text-neutral-400 border-neutral-700'
                            : 'bg-emerald-950 text-emerald-400 border-emerald-800/40'
                        }`}
                      >
                        {item.managementScope === 'EXCLUDED' || item.status === 'BLOCKED_EXCLUDED' ? 'EXCLUDED' : 'SIAP OTOMASI'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {item.managementScope === 'EXCLUDED' ? (
                        <button
                          onClick={() => handleEnrollItem(item.videoId)}
                          disabled={isEnrolling}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-neutral-800 hover:bg-emerald-900 text-neutral-400 hover:text-emerald-300 transition cursor-pointer"
                        >
                          Masukkan Kembali
                        </button>
                      ) : (
                        <button
                          onClick={() => handleExcludeItem(item.videoId)}
                          disabled={isEnrolling}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
                        >
                          Kecualikan
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Toggle Expand / Collapse (Lihat Semua Video Kloter Ini / Tampilkan Lebih Sedikit) */}
        {currentKloterItems.length > 10 && (
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setIsTableExpanded(!isTableExpanded)}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-950/80 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer group shadow-sm"
            >
              {isTableExpanded ? (
                <>
                  <span>Tampilkan Lebih Sedikit ↑</span>
                  <ChevronUp className="w-4 h-4 text-red-400 group-hover:-translate-y-0.5 transition-transform" />
                </>
              ) : (
                <>
                  <span>Lihat Semua Video Kloter Ini ({currentKloterItems.length} Video) ↓</span>
                  <ChevronDown className="w-4 h-4 text-red-400 group-hover:translate-y-0.5 transition-transform" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Pagination & Kloter Navigation */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-neutral-800 text-xs text-neutral-400">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Menampilkan <strong className="text-neutral-200">{displayPreviewItems.length}</strong> dari{' '}
              <strong className="text-neutral-200">{currentKloterItems.length}</strong> video kloter ini
              {includedItems.length > currentKloterItems.length && (
                <span> (Total Semua Kloter: <strong className="text-emerald-400">{includedItems.length}</strong> Video)</span>
              )}
            </span>
            <span className="text-neutral-600 hidden sm:inline">•</span>
            <div className="flex items-center gap-1 bg-neutral-950/80 p-0.5 rounded-lg border border-neutral-800">
              <button
                type="button"
                onClick={() => { setPageSize(50); setCurrentPage(1); setIsTableExpanded(false); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  pageSize === 50
                    ? 'bg-neutral-800 text-white font-bold border border-neutral-700 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Kloter per 50
              </button>
              <button
                type="button"
                onClick={() => { setPageSize(0); setCurrentPage(1); setIsTableExpanded(true); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  pageSize === 0
                    ? 'bg-neutral-800 text-white font-bold border border-neutral-700 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Tampilkan Semua ({visiblePreviewItems.length})
              </button>
            </div>
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  setIsTableExpanded(false);
                }}
                disabled={effectivePage === 1}
                className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-200 text-xs font-semibold cursor-pointer"
              >
                Sebelumnya
              </button>

              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => {
                const startNum = (pageNum - 1) * pageSize + 1;
                const endNum = Math.min(pageNum * pageSize, visiblePreviewItems.length);
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => {
                      setCurrentPage(pageNum);
                      setIsTableExpanded(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      effectivePage === pageNum
                        ? 'bg-red-600 text-white font-bold shadow-md shadow-red-900/40'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                    }`}
                  >
                    Kloter {pageNum} ({startNum}–{endNum})
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  setIsTableExpanded(false);
                }}
                disabled={effectivePage === totalPages}
                className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-200 text-xs font-semibold cursor-pointer"
              >
                Berikutnya
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Automation Batches History */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <History className="w-4 h-4 text-neutral-400" />
            Riwayat Batch Otomasi
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearStaleLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition active:scale-95 cursor-pointer"
              title="Bersihkan riwayat batch yang macet, gagal, atau telah selesai"
            >
              <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
              <span>Bersihkan Log Riwayat</span>
            </button>
            <span className="text-xs text-neutral-400">{batches.length} Batch Tercatat</span>
          </div>
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
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-500 text-xs">
                    Belum ada pekerjaan automation.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const isRollingBack = rollingBackBatchId === batch.id;
                  const isRolledBack = (batch as any).isRolledBack;

                  return (
                    <tr key={batch.id} className="hover:bg-neutral-800/30 transition">
                      <td className="py-3 px-3 font-mono font-bold text-neutral-100">
                        {batch.batchNumber}
                      </td>
                      <td className="py-3 px-3">{batch.channelTitle || '—'}</td>
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
                      <div className="flex items-center justify-end gap-1.5">
                        {!batch.isDryRun && !isRolledBack && (
                          <button
                            onClick={() => setBatchToRollback(batch)}
                            disabled={isRollingBack}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 transition cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Pulihkan seluruh video pada batch ini ke metadata awal dan status privat"
                          >
                            <RotateCcw className={`w-3 h-3 text-rose-400 ${isRollingBack ? 'animate-spin' : ''}`} />
                            <span>{isRollingBack ? 'Memulihkan...' : 'Pemulihan'}</span>
                          </button>
                        )}
                        {isRolledBack && (
                          <span className="text-[11px] text-purple-400 font-mono">Dipulihkan</span>
                        )}
                        <button
                          onClick={() => handleDeleteBatch(batch.id)}
                          disabled={deletingBatchId === batch.id}
                          className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-950/60 hover:text-red-400 text-neutral-400 border border-neutral-700/60 transition cursor-pointer active:scale-95 disabled:opacity-50"
                          title={`Hapus riwayat batch ${batch.batchNumber} dari database`}
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${deletingBatchId === batch.id ? 'animate-spin text-red-400' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }))}
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
                <strong className="text-emerald-400">{candidateItems.length} AMG Regular videos</strong> on channel{' '}
                <strong className="text-white">"{selectedChannel?.title}"</strong>.
              </p>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-[11px] text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Auto-Enroll Aktif (Tanpa Langkah Manual):
                </div>
                <div>
                  • Seluruh <strong>{candidateItems.length} video kandidat</strong> otomatis didaftarkan ke AMG Reguler (Kloter 1: {kloter1Count} video, sisa {Math.max(0, candidateItems.length - kloter1Count)} video berlanjut otomatis ke Kloter 2).
                </div>
                {excludedItems.length > 0 && (
                  <div className="text-neutral-400">
                    • <strong>{excludedItems.length} video dikecualikan</strong> tetap terlindungi dan tidak akan diubah.
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-[11px]">
                <div className="font-semibold text-neutral-200">Rencana Eksekusi Berantai (Auto-Chaining):</div>
                <ul className="list-disc list-inside space-y-1 text-neutral-400">
                  <li>Kapasitas per kloter: <strong>50 video per eksekusi</strong> (Kloter 1 dimulai segera).</li>
                  <li><strong>Auto-Chaining Berantai:</strong> Setelah 50 video selesai, worker otomatis melanjutkan ke 50 video berikutnya tanpa klik ulang.</li>
                  <li><strong>Anti-Spam Throttling:</strong> Jeda aman 2 hingga 4 detik di antara setiap video untuk mencegah deteksi bot YouTube.</li>
                  <li><strong>Upload Serial:</strong> Thumbnail diunggah satu per satu secara berurutan (bukan paralel).</li>
                  <li><strong>Batas Kuota YouTube 70/24 Jam:</strong> Jika kuota mendekati batas, sisa video dialihkan ke 'Menunggu Kuota Besok' untuk mencegah error 403.</li>
                  <li>Verifikasi read-after-write dan pencatatan snapshot otomatis untuk rollback darurat.</li>
                </ul>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleStartAutomation}
                  disabled={isExecuting || candidateItems.length === 0}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-900/30 cursor-pointer disabled:opacity-50"
                >
                  {isExecuting ? 'Memulai Otomasi...' : `Konfirmasi & Mulai Otomasi (Semua: ${candidateItems.length} Video) - Kloter 1 (${kloter1Count} Video)`}
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
