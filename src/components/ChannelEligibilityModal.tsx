import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Clock,
  Tag,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
  AlertTriangle,
  Calendar,
  Save,
} from 'lucide-react';
import { Channel } from '../types/index.ts';
import { api } from '../services/api.ts';

interface ChannelEligibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  onUpdated: () => void;
}

export const ChannelEligibilityModal: React.FC<ChannelEligibilityModalProps> = ({
  isOpen,
  onClose,
  channel,
  onUpdated,
}) => {
  const [windowDays, setWindowDays] = useState<number>(channel.eligibilityWindowDays || 7);
  const [patterns, setPatterns] = useState<string[]>(
    channel.eligibleTitlePatterns && channel.eligibleTitlePatterns.length > 0
      ? [...channel.eligibleTitlePatterns]
      : ['Salinan dari A', 'Copy of A']
  );
  const [newPatternInput, setNewPatternInput] = useState('');
  const [autoEnroll, setAutoEnroll] = useState<boolean>(channel.autoEnroll ?? false);
  const [latestManagedUploadAt, setLatestManagedUploadAt] = useState<string>(
    channel.latestManagedUploadAt || '2026-09-23T03:15:00.000Z'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddPattern = () => {
    const trimmed = newPatternInput.trim();
    if (!trimmed) return;
    if (!patterns.includes(trimmed)) {
      setPatterns([...patterns, trimmed]);
    }
    setNewPatternInput('');
  };

  const handleRemovePattern = (index: number) => {
    setPatterns(patterns.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (patterns.length === 0) {
      setError('Minimal satu pola judul diperlukan.');
      return;
    }
    if (windowDays <= 0) {
      setError('Jendela waktu kelayakan harus lebih dari 0 hari.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await api.updateEligibilityConfig(channel.id, {
        eligibilityWindowDays: windowDays,
        eligibleTitlePatterns: patterns,
        autoEnroll,
        latestManagedUploadAt,
      });
      setSuccessMsg('Pengaturan kelayakan berhasil disimpan.');
      onUpdated();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan kelayakan.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-100 uppercase tracking-tight flex items-center gap-2">
                Aturan Kelayakan Video
              </h2>
              <p className="text-xs text-neutral-400">{channel.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300">
              {successMsg}
            </div>
          )}

          {/* 1. Upload Cutoff Anchor */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-neutral-200 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                Batas Waktu Unggah Terkelola AMG (latestManagedUploadAt)
              </label>
            </div>
            <p className="text-[11px] text-neutral-400">
              Titik Jangkar Keamanan Kritis: Video yang diunggah sebelum atau tepat pada batas ini terlindungi tanpa syarat sebagai arsip historis/pribadi.
            </p>
            <input
              type="text"
              value={latestManagedUploadAt}
              onChange={(e) => setLatestManagedUploadAt(e.target.value)}
              placeholder="contoh: 2026-09-23T03:15:00.000Z"
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 font-mono text-neutral-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* 2. Eligibility Window Days */}
          <div className="space-y-1.5">
            <label className="font-bold text-neutral-200 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Jendela Waktu Kelayakan (Hari)
            </label>
            <p className="text-[11px] text-neutral-400">
              Video yang diunggah lebih lampau dari jendela ini relatif terhadap waktu saat ini diklasifikasikan sebagai <span className="font-mono text-amber-400">PROTECTED_OLD</span> dan tidak disentuh.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={365}
                value={windowDays}
                onChange={(e) => setWindowDays(parseInt(e.target.value, 10) || 7)}
                className="w-24 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-neutral-400">hari</span>
              <div className="flex gap-2">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setWindowDays(d)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      windowDays === d
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {d} hari
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Eligible Title Patterns */}
          <div className="space-y-2">
            <label className="font-bold text-neutral-200 uppercase tracking-wide text-[11px] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              Pola Judul yang Layak
            </label>
            <p className="text-[11px] text-neutral-400">
              Video harus cocok dengan salah satu awalan atau pola judul berikut (tidak sensitif huruf besar/kecil) untuk memenuhi syarat sebagai kandidat. Yang tidak cocok tetap dibiarkan belum diklasifikasi.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {patterns.map((p, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs font-mono"
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => handleRemovePattern(idx)}
                    className="text-neutral-500 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newPatternInput}
                onChange={(e) => setNewPatternInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPattern())}
                placeholder="Tambah pola (contoh: Salinan dari A)"
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddPattern}
                className="px-3 py-2 rounded-lg font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah
              </button>
            </div>
          </div>

          {/* 4. Enrollment Mode */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="font-bold text-neutral-200 uppercase text-[11px]">
                Mode Pendaftaran Kandidat
              </div>
              <div className="text-[11px] text-neutral-400">
                {autoEnroll
                  ? 'Pendaftaran otomatis: Kandidat yang layak langsung masuk Lingkup Reguler AMG secara otomatis.'
                  : 'Tinjau manual: Kandidat membutuhkan persetujuan eksplisit pengguna sebelum masuk otomasi.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoEnroll(!autoEnroll)}
              className="text-neutral-300 hover:text-white transition cursor-pointer"
            >
              {autoEnroll ? (
                <ToggleRight className="w-8 h-8 text-emerald-400" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-neutral-500" />
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition text-xs cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-xs disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </div>
    </div>
  );
};
