import React, { useState, useEffect } from 'react';
import {
  Type,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Check,
  RotateCw,
  Eye,
  Layers,
  Sparkles,
  AlertTriangle,
  X,
} from 'lucide-react';
import { MasterTitle, ContentProfile, Channel } from '../types/index.ts';
import { api, isRealTitle } from '../services/api.ts';

interface MasterTitlesViewProps {
  titles: MasterTitle[];
  profiles: ContentProfile[];
  channels?: Channel[];
  selectedChannelId?: string;
  onSelectChannel?: (channelId: string) => void;
  onTitlesUpdated: () => void;
}

export const MasterTitlesView: React.FC<MasterTitlesViewProps> = ({
  titles,
  profiles,
  channels = [],
  selectedChannelId = '',
  onSelectChannel,
  onTitlesUpdated,
}) => {
  // Active Channel & Profile Resolution
  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];
  const activeProfile = profiles.find(
    (p) =>
      p.id === activeChannel?.blockId ||
      p.id === activeChannel?.contentProfileId ||
      p.id === `profile-${activeChannel?.id}` ||
      p.id === activeChannel?.id
  ) || profiles[0];

  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    activeProfile?.id || profiles[0]?.id || ''
  );
  const [newTitleText, setNewTitleText] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingModalTitle, setEditingModalTitle] = useState<MasterTitle | null>(null);
  const [deletingTitle, setDeletingTitle] = useState<MasterTitle | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync profile when active channel changes
  useEffect(() => {
    if (activeProfile?.id) {
      setSelectedProfileId(activeProfile.id);
    }
  }, [activeChannel?.id, activeProfile?.id]);

  // Filter titles strictly for the active channel & block - 100% Isolated & Persistent
  const currentBlockId = selectedProfileId || activeProfile?.id || activeChannel?.blockId || activeChannel?.contentProfileId || '';

  // Merge titles from props with direct channel localStorage (amg_master_titles_{channelId})
  const channelTitlesFromStorage = React.useMemo(() => {
    if (!activeChannel?.id) return [];
    const cleanChan = activeChannel.id.replace(/^chan-/, '');
    const raw1 = localStorage.getItem(`amg_master_titles_${activeChannel.id}`);
    const raw2 = localStorage.getItem(`amg_master_titles_${cleanChan}`);
    const raw3 = localStorage.getItem(`amg_master_titles_chan-${cleanChan}`);
    const stored = raw1 || raw2 || raw3;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.filter(isRealTitle);
      } catch {}
    }
    return [];
  }, [activeChannel?.id, titles]);

  const profileTitles = React.useMemo(() => {
    const list: MasterTitle[] = [];
    const seen = new Set<string>();

    // Priority 1: Channel-specific titles from storage
    for (const t of channelTitlesFromStorage) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        list.push(t);
      }
    }

    // Priority 2: Titles from props
    for (const t of titles || []) {
      if (!isRealTitle(t)) continue;
      if (activeChannel?.id) {
        const cleanChan = activeChannel.id.replace(/^chan-/, '');
        const isMatch =
          t.channelId === activeChannel.id ||
          t.channelId === cleanChan ||
          t.channelId === `chan-${cleanChan}` ||
          (activeChannel.youtubeChannelId && t.channelId === activeChannel.youtubeChannelId);
        if (isMatch && !seen.has(t.id)) {
          seen.add(t.id);
          list.push(t);
          continue;
        }
      }
      const titleBlock = t.blockId || t.profileId;
      if (currentBlockId && (titleBlock === currentBlockId || titleBlock === activeProfile?.id) && !seen.has(t.id)) {
        seen.add(t.id);
        list.push(t);
      }
    }

    return list.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [titles, channelTitlesFromStorage, activeChannel?.id, currentBlockId, activeProfile?.id]);

  const handleAddTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitleText.trim()) return;
    setIsAdding(true);
    try {
      await api.createMasterTitle({
        blockId: currentBlockId || (activeChannel ? `profile-${activeChannel.id}` : 'block-general'),
        profileId: currentBlockId || (activeChannel ? `profile-${activeChannel.id}` : 'block-general'),
        channelId: activeChannel?.id,
        text: newTitleText.trim(),
        orderIndex: profileTitles.length,
      });
      setNewTitleText('');
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menambahkan judul master');
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenEdit = (title: MasterTitle, idx?: number) => {
    const target = title || (idx !== undefined ? profileTitles[idx] : null);
    if (!target) {
      console.warn('Judul master tidak ditemukan');
      return;
    }
    setEditingModalTitle(target);
    setEditingText(target.text || '');
  };

  const handleSaveModalEdit = async () => {
    if (!editingModalTitle) return;
    if (!editingText.trim()) return;
    setIsSavingEdit(true);
    try {
      await api.updateMasterTitle(editingModalTitle.id, { text: editingText.trim() });
      setEditingModalTitle(null);
      setEditingText('');
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui judul master');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTitle) return;
    setIsDeleting(true);
    try {
      await api.deleteMasterTitle(deletingTitle.id);
      setDeletingTitle(null);
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus judul master');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async (title: MasterTitle) => {
    if (!editingText.trim()) return;
    try {
      await api.updateMasterTitle(title.id, { text: editingText.trim() });
      setEditingTitleId(null);
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui judul master');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= profileTitles.length) return;

    const currentTitle = profileTitles[index];
    const targetTitle = profileTitles[targetIndex];

    try {
      await Promise.all([
        api.updateMasterTitle(currentTitle.id, { orderIndex: targetIndex }),
        api.updateMasterTitle(targetTitle.id, { orderIndex: index }),
      ]);
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal mengatur urutan judul');
    }
  };

  const handleDelete = async (title: MasterTitle) => {
    setDeletingTitle(title);
  };

  const handleToggleActive = async (title: MasterTitle) => {
    try {
      await api.updateMasterTitle(title.id, { isActive: !title.isActive });
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status judul');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <Type className="w-6 h-6 text-red-500" />
            MASTER JUDUL & ROTASI DETERMINISTIK
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Konfigurasikan N Master Judul dinamis. Rotasi berurutan menetapkan setiap judul secara pasti tanpa pemilihan acak.
          </p>
        </div>

        {/* Channel / Profile Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {channels && channels.length > 0 ? (
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">CHANNEL:</span>
              <select
                value={activeChannel?.id || ''}
                onChange={(e) => onSelectChannel?.(e.target.value)}
                className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs font-bold focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer shadow-sm"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id} className="bg-neutral-900 text-white font-medium">
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-neutral-400 uppercase">PROFIL:</span>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeChannel && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 text-[11px] text-neutral-300 border border-neutral-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Profil: <strong className="text-neutral-100">{activeProfile?.name || activeChannel.title}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Add Title Input Box */}
      <form onSubmit={handleAddTitle} className="flex gap-2">
        <input
          type="text"
          value={newTitleText}
          onChange={(e) => setNewTitleText(e.target.value)}
          placeholder={`Masukkan Master Judul baru khusus channel ${activeChannel?.title || 'aktif'}...`}
          className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
        />
        <button
          type="submit"
          disabled={isAdding || !newTitleText.trim()}
          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-red-900/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tambah Master Judul</span>
        </button>
      </form>

      {/* Main Grid: Titles List + Live Round-Robin Rotation Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Titles List (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-300 uppercase tracking-wider">
            <span>JUDUL TERKONFIGURASI KHUSUS {activeChannel?.title?.toUpperCase() || 'CHANNEL'} ({profileTitles.length})</span>
            <span className="text-neutral-500 font-normal">URUTAN DETERMINISTIK</span>
          </div>

          {profileTitles.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center text-neutral-400 text-xs space-y-1">
              <div className="text-amber-400 font-semibold flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Belum ada master judul ditambahkan</span>
              </div>
              <p className="text-neutral-500 text-[11px]">
                Silakan tambahkan judul pertama di atas. AMG Command Center hanya memproses data judul nyata yang Anda masukkan.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {profileTitles.map((title, idx) => (
                <div
                  key={title.id}
                  className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 flex items-center justify-between gap-3 transition"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-lg bg-neutral-800 text-neutral-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                      T{idx + 1}
                    </span>

                    {editingTitleId === title.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveEdit(title)}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-neutral-100 truncate">
                          {title.text}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">
                          Indeks: #{idx} • Status: {title.isActive ? 'Aktif' : 'Dijeda'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition"
                      title="Pindahkan ke atas"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === profileTitles.length - 1}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition"
                      title="Pindahkan ke bawah"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(title, idx)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                      title="Ubah teks judul"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(title)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition cursor-pointer"
                      title="Hapus judul"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Round-Robin Rotation Preview (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-300 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <RotateCw className="w-3.5 h-3.5 text-red-500" />
              SIMULATOR ROTASI ({activeChannel?.title?.toUpperCase() || 'CHANNEL'})
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">100% DETERMINISTIK</span>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Saat sistem memproses antrean video untuk channel <strong className="text-neutral-200">{activeChannel?.title || 'ini'}</strong>, setiap video akan menerima judul sesuai urutan rotasi deterministik modulo berikut:
            </p>

            <div className="space-y-1.5 pt-1 max-h-[480px] overflow-y-auto pr-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seq) => {
                const assignedIdx = profileTitles.length > 0 ? (seq - 1) % profileTitles.length : -1;
                const assignedTitle = assignedIdx >= 0 ? profileTitles[assignedIdx] : null;

                return (
                  <div
                    key={seq}
                    className="p-2 rounded-lg bg-neutral-900/70 border border-neutral-800/60 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-neutral-400 text-[11px] shrink-0">
                      Video #{seq}:
                    </span>
                    <span className="font-semibold text-neutral-200 truncate ml-2 text-right">
                      {assignedTitle ? (
                        <>
                          <span className="text-red-400 font-mono text-[10px] mr-1.5">[T{assignedIdx + 1}]</span>
                          {assignedTitle.text}
                        </>
                      ) : (
                        'Menunggu penyiapan judul'
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Master Title Modal */}
      {editingModalTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-red-500" />
                Edit Master Judul
              </h3>
              <button
                onClick={() => setEditingModalTitle(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs text-neutral-300 block mb-1 font-medium">Teks Judul</label>
              <input
                type="text"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="Masukkan judul..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                autoFocus
              />
              <p className="text-[10px] text-neutral-500 mt-1.5 font-mono">
                ID Item: {editingModalTitle.id} • Channel: {activeChannel?.title || 'Aktif'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingModalTitle(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingEdit || !editingText.trim()}
                onClick={handleSaveModalEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition cursor-pointer"
              >
                {isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-500" />
                Konfirmasi Hapus
              </h3>
              <button
                onClick={() => setDeletingTitle(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-300">
              Apakah Anda yakin ingin menghapus master judul <strong className="text-white">"{deletingTitle.text}"</strong>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTitle(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
