import React, { useState } from 'react';
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
} from 'lucide-react';
import { MasterTitle, ContentProfile } from '../types/index.ts';
import { api } from '../services/api.ts';

interface MasterTitlesViewProps {
  titles: MasterTitle[];
  profiles: ContentProfile[];
  onTitlesUpdated: () => void;
}

export const MasterTitlesView: React.FC<MasterTitlesViewProps> = ({
  titles,
  profiles,
  onTitlesUpdated,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0]?.id || 'profile-ayam-warna');
  const [newTitleText, setNewTitleText] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Filter titles for the selected profile
  const profileTitles = titles
    .filter((t) => t.profileId === selectedProfileId)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const handleAddTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitleText.trim()) return;
    setIsAdding(true);
    try {
      await api.createMasterTitle({
        profileId: selectedProfileId,
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
    if (!confirm(`Hapus master judul "${title.text}"?`)) return;
    try {
      await api.deleteMasterTitle(title.id);
      onTitlesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus judul');
    }
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

        {/* Profile Selector */}
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
      </div>

      {/* Add Title Input Box */}
      <form onSubmit={handleAddTitle} className="flex gap-2">
        <input
          type="text"
          value={newTitleText}
          onChange={(e) => setNewTitleText(e.target.value)}
          placeholder="Masukkan Master Judul baru..."
          className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
        />
        <button
          type="submit"
          disabled={isAdding || !newTitleText.trim()}
          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-red-900/20"
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
            <span>JUDUL TERKONFIGURASI ({profileTitles.length})</span>
            <span className="text-neutral-500 font-normal">URUTKAN ULANG UNTUK MENGATUR INDEKS ROTASI</span>
          </div>

          {profileTitles.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center text-neutral-500 text-xs">
              Belum ada Master Judul untuk profil ini. Tambahkan judul pertama Anda di atas.
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
                      onClick={() => {
                        setEditingTitleId(title.id);
                        setEditingText(title.text);
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                      title="Ubah teks judul"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(title)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition"
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
              SIMULATOR ROTASI
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">100% DETERMINISTIK</span>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Saat sistem memproses kumpulan video yang belum dikelola untuk profil ini, setiap video akan menerima judul sesuai urutan rotasi berikut:
            </p>

            <div className="space-y-1.5 pt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((seq) => {
                const assignedTitle =
                  profileTitles.length > 0
                    ? profileTitles[(seq - 1) % profileTitles.length]
                    : null;

                return (
                  <div
                    key={seq}
                    className="p-2 rounded-lg bg-neutral-900/70 border border-neutral-800/60 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-neutral-400 text-[11px]">
                      Video #{seq}:
                    </span>
                    <span className="font-semibold text-neutral-200 truncate ml-2 text-right">
                      {assignedTitle ? assignedTitle.text : 'Menunggu penyiapan judul'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
