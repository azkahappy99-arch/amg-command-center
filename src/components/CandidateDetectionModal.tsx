import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  Calendar,
  Layers,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Eye,
  Check,
} from 'lucide-react';
import { ManagedVideo, Channel } from '../types/index.ts';
import { api } from '../services/api.ts';

interface CandidateDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  onCandidatesUpdated: () => void;
}

export const CandidateDetectionModal: React.FC<CandidateDetectionModalProps> = ({
  isOpen,
  onClose,
  channel,
  onCandidatesUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'CANDIDATES' | 'ENROLLED' | 'CUTOFF' | 'OLD' | 'UNCLASSIFIED' | 'EXCLUDED'>('CANDIDATES');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<{
    candidates: ManagedVideo[];
    enrolledEligible: ManagedVideo[];
    protectedByCutoff: ManagedVideo[];
    protectedOld: ManagedVideo[];
    unclassified: ManagedVideo[];
    alreadyManaged: ManagedVideo[];
    excluded: ManagedVideo[];
    statistics: {
      totalEvaluated: number;
      newCandidates: number;
      enrolledEligible: number;
      protectedOld: number;
      protectedByCutoff: number;
      unclassified: number;
      alreadyManaged: number;
      excluded: number;
    };
    config: {
      eligibilityWindowDays: number;
      eligibleTitlePatterns: string[];
      latestManagedUploadAt: string | null;
      autoEnroll: boolean;
    };
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchCandidates = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await api.detectCandidates(channel.id);
      setData(res);
    } catch (err: any) {
      setMessage(`Error running detection: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCandidates();
    }
  }, [isOpen, channel.id]);

  if (!isOpen) return null;

  const handleEnrollSingle = async (videoId: string) => {
    setIsProcessing(true);
    try {
      await api.enrollCandidate(videoId);
      await fetchCandidates();
      onCandidatesUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to enroll video');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectSingle = async (videoId: string) => {
    setIsProcessing(true);
    try {
      await api.rejectCandidate(videoId, 'Excluded by user from candidate review.');
      await fetchCandidates();
      onCandidatesUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to exclude video');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnrollAll = async () => {
    setIsProcessing(true);
    try {
      const res = await api.enrollAllCandidates(channel.id);
      setMessage(`Successfully enrolled ${res.enrolledCount} candidate(s) into AMG Regular Scope.`);
      await fetchCandidates();
      onCandidatesUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to bulk enroll candidates');
    } finally {
      setIsProcessing(false);
    }
  };

  const getListForTab = () => {
    if (!data) return [];
    switch (activeTab) {
      case 'CANDIDATES':
        return data.candidates;
      case 'ENROLLED':
        return data.enrolledEligible;
      case 'CUTOFF':
        return data.protectedByCutoff;
      case 'OLD':
        return data.protectedOld;
      case 'UNCLASSIFIED':
        return data.unclassified;
      case 'EXCLUDED':
        return data.excluded;
      default:
        return [];
    }
  };

  const currentList = getListForTab();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800/80 text-cyan-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-100 uppercase tracking-tight flex items-center gap-2">
                Detektor Kelayakan Video Multi-Lapisan
              </h2>
              <p className="text-xs text-neutral-400">
                Channel: <span className="font-semibold text-neutral-200">{channel.title}</span> — Batas Unggah &amp; Perlindungan Jendela Waktu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Header & Statistics */}
        <div className="p-4 bg-neutral-950 border-b border-neutral-800 text-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center gap-2">
                <span className="text-neutral-400">Dievaluasi:</span>
                <span className="font-black text-neutral-100">{data?.statistics.totalEvaluated || 0}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center gap-2">
                <span className="text-emerald-400 font-bold">Kandidat:</span>
                <span className="font-black text-emerald-300">{data?.statistics.newCandidates || 0}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-purple-950/60 border border-purple-800/60 flex items-center gap-2">
                <span className="text-purple-400 font-bold">Terlindungi Batas Unggah:</span>
                <span className="font-black text-purple-300">{data?.statistics.protectedByCutoff || 0}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800/60 flex items-center gap-2">
                <span className="text-amber-400 font-bold">Historis (&gt;7 hari):</span>
                <span className="font-black text-amber-300">{data?.statistics.protectedOld || 0}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchCandidates}
                disabled={isLoading || isProcessing}
                className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition cursor-pointer"
                title="Perbarui Deteksi"
              >
                <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
              {data && data.candidates.length > 0 && (
                <button
                  onClick={handleEnrollAll}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition disabled:opacity-50 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Daftarkan Semua {data.candidates.length} Kandidat
                </button>
              )}
            </div>
          </div>

          {message && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[11px]">
              {message}
            </div>
          )}

          {/* Navigation Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-neutral-800/60">
            <button
              onClick={() => setActiveTab('CANDIDATES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'CANDIDATES'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Kandidat ({data?.candidates.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('ENROLLED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'ENROLLED'
                  ? 'bg-blue-950 text-blue-300 border border-blue-700 shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
              Terdaftar Reguler ({data?.enrolledEligible.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('CUTOFF')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'CUTOFF'
                  ? 'bg-purple-950 text-purple-300 border border-purple-700 shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              Terlindung Batas ({data?.protectedByCutoff.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('OLD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'OLD'
                  ? 'bg-amber-950 text-amber-300 border border-amber-700 shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Historis &gt;7hr ({data?.protectedOld.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('UNCLASSIFIED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'UNCLASSIFIED'
                  ? 'bg-zinc-800 text-zinc-200 border border-zinc-600 shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
              Perlu Lingkup ({data?.unclassified.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('EXCLUDED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'EXCLUDED'
                  ? 'bg-red-950 text-red-300 border border-red-700 shadow'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ShieldX className="w-3.5 h-3.5 text-red-400" />
              Dikecualikan ({data?.excluded.length || 0})
            </button>
          </div>
        </div>

        {/* Video List Table */}
        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {isLoading ? (
            <div className="p-12 text-center text-neutral-400 flex flex-col items-center justify-center gap-3">
              <RotateCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Menganalisis video channel dengan aturan kelayakan multi-lapis...</span>
            </div>
          ) : currentList.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 bg-neutral-950/40 rounded-xl border border-dashed border-neutral-800">
              Tidak ada video dalam kategori ini.
            </div>
          ) : (
            <div className="space-y-2">
              {currentList.map((video) => (
                <div
                  key={video.id}
                  className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-neutral-700 transition"
                >
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-100 text-xs truncate">{video.titleBefore}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-900 text-neutral-400 border border-neutral-800">
                        {video.privacyStatus}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
                      <span>
                        Diunggah:{' '}
                        <strong className="text-neutral-300 font-mono">
                          {new Date(video.originalUploadAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                        </strong>
                      </span>
                      <span>ID: {video.youtubeVideoId}</span>
                      {video.exclusionReason && (
                        <span className="text-red-400 italic font-mono">Alasan: {video.exclusionReason}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions depending on category */}
                  <div className="flex items-center gap-2 shrink-0">
                    {activeTab === 'CANDIDATES' && (
                      <>
                        <button
                          onClick={() => handleEnrollSingle(video.id)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] transition shadow cursor-pointer"
                        >
                          Daftarkan ke AMG Reguler
                        </button>
                        <button
                          onClick={() => handleRejectSingle(video.id)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 rounded-lg font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] transition cursor-pointer"
                        >
                          Kecualikan
                        </button>
                      </>
                    )}

                    {activeTab === 'UNCLASSIFIED' && (
                      <>
                        <button
                          onClick={() => handleEnrollSingle(video.id)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 rounded-lg font-bold bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] transition cursor-pointer"
                        >
                          Tambahkan ke Reguler
                        </button>
                        <button
                          onClick={() => handleRejectSingle(video.id)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 rounded-lg font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] transition cursor-pointer"
                        >
                          Kecualikan
                        </button>
                      </>
                    )}

                    {activeTab === 'ENROLLED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                        <Check className="w-3.5 h-3.5" /> Terdaftar &amp; Siap
                      </span>
                    )}

                    {activeTab === 'CUTOFF' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                        TERLINDUNGI_BATAS_UNGGAH
                      </span>
                    )}

                    {activeTab === 'OLD' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        TERLINDUNGI_HISTORIS
                      </span>
                    )}

                    {activeTab === 'EXCLUDED' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-900 text-neutral-400 border border-neutral-700">
                        DIKECUALIKAN
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-400">
          <span>Mesin Isolasi Aman — Nol perubahan pada video historis atau yang dikecualikan</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
