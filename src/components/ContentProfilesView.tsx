import React, { useState } from 'react';
import { Layers, Plus, Edit2, Trash2, Check, AlertCircle, Calendar, Clock, Tv } from 'lucide-react';
import { ContentProfile, Channel, ScheduleConfig } from '../types/index.ts';
import { api } from '../services/api.ts';
import { ScheduleConfigEditor } from './ScheduleConfigEditor.tsx';
import { NicheBadge, NICHE_PRESETS } from '../utils/nicheCategories';

interface ContentProfilesViewProps {
  profiles: ContentProfile[];
  channels: Channel[];
  onProfilesUpdated: () => void;
  onNavigateToTitles: () => void;
  onNavigateToThumbnails: () => void;
}

export const ContentProfilesView: React.FC<ContentProfilesViewProps> = ({
  profiles,
  channels,
  onProfilesUpdated,
  onNavigateToTitles,
  onNavigateToThumbnails,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ContentProfile | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nicheCategory, setNicheCategory] = useState<string>('Ayam Warna Warni');
  const [customNiche, setCustomNiche] = useState<string>('');
  const [nicheBadge, setNicheBadge] = useState<string>('amber');
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 3,
    times: ['08:00', '14:00', '20:00'],
    timezone: 'Asia/Jakarta',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingProfile(null);
    setName('');
    setDescription('');
    setNicheCategory('Ayam Warna Warni');
    setCustomNiche('');
    setNicheBadge('amber');
    setScheduleConfig({
      mode: 'CUSTOM_DAILY_TIMES',
      videosPerDay: 3,
      times: ['08:00', '14:00', '20:00'],
      timezone: 'Asia/Jakarta',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (profile: ContentProfile) => {
    setEditingProfile(profile);
    setName(profile.name);
    setDescription(profile.description);
    setNicheCategory(profile.nicheCategory || 'Ayam Warna Warni');
    setCustomNiche(
      NICHE_PRESETS.some((p) => p.category === profile.nicheCategory) ? '' : (profile.nicheCategory || '')
    );
    setNicheBadge(profile.nicheBadge || 'amber');
    setScheduleConfig(
      profile.scheduleConfig || {
        mode: profile.publishFrequency === '1/day' ? 'DAILY' : 'CUSTOM_DAILY_TIMES',
        videosPerDay: profile.publishFrequency === '2/day' ? 2 : 1,
        times: profile.publishTime ? profile.publishTime.split(',').map((s) => s.trim()) : ['16:00'],
        timezone: profile.timezone || 'Asia/Jakarta',
      }
    );
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setIsSubmitting(true);
    const finalCategory = nicheCategory === 'CUSTOM' ? (customNiche.trim() || 'General') : nicheCategory;
    try {
      if (editingProfile) {
        await api.updateContentProfile(editingProfile.id, {
          name,
          description,
          nicheCategory: finalCategory,
          nicheBadge,
          publishFrequency: `${scheduleConfig.videosPerDay}/day`,
          publishTime: scheduleConfig.times.join(', '),
          timezone: scheduleConfig.timezone,
          scheduleConfig,
        });
      } else {
        await api.createContentProfile({
          name,
          description,
          nicheCategory: finalCategory,
          nicheBadge,
          publishFrequency: `${scheduleConfig.videosPerDay}/day`,
          publishTime: scheduleConfig.times.join(', '),
          timezone: scheduleConfig.timezone,
          scheduleConfig,
        });
      }
      setIsModalOpen(false);
      onProfilesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan profil konten');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus profil "${name}"?`)) return;
    try {
      await api.deleteContentProfile(id);
      onProfilesUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus profil konten');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <Layers className="w-6 h-6 text-red-500" />
            PROFIL KONTEN
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Konfigurasikan template master judul, thumbnail, dan jadwal publikasi yang dapat digunakan kembali.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition active:scale-95 shadow-lg shadow-red-900/30"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tambah Profil Konten</span>
        </button>
      </div>

      {/* Profile Notice */}
      <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-neutral-200">Lingkup Konten Independen: </span>
          Beberapa channel dapat menggunakan Profil Konten yang sama (contoh: 'AYAM WARNA'). Pembaruan profil hanya berlaku untuk batch video berikutnya yang belum dikelola.
        </div>
      </div>

      {/* Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((profile) => {
          const assignedChannels = channels.filter((c) => c.contentProfileId === profile.id);

          return (
            <div
              key={profile.id}
              className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700/80 flex flex-col justify-between transition group space-y-4"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-neutral-100 group-hover:text-red-400 transition">
                        {profile.name}
                      </h3>
                      <NicheBadge category={profile.nicheCategory} badgeKey={profile.nicheBadge} />
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                      {profile.description || 'Tidak ada deskripsi profil.'}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                    {assignedChannels.length} Channel
                  </span>
                </div>

                {/* Configuration badges */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs py-2 border-y border-neutral-800/60">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase">Frekuensi Baku</span>
                    <div className="font-bold text-rose-400">
                      {profile.scheduleConfig?.videosPerDay || profile.publishFrequency} Video/hari
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase">Waktu Publikasi Baku</span>
                    <div className="font-medium text-neutral-200 truncate" title={profile.scheduleConfig?.times?.join(', ') || profile.publishTime}>
                      {profile.scheduleConfig?.times?.join(', ') || profile.publishTime} ({profile.scheduleConfig?.timezone === 'Asia/Jakarta' ? 'WIB' : profile.scheduleConfig?.timezone || profile.timezone || 'WIB'})
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase">Master Judul</span>
                    <div className="font-bold text-neutral-200">{profile.masterTitleIds.length} Terdaftar</div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase">Master Thumbnail</span>
                    <div className="font-bold text-neutral-200">{profile.masterThumbnailIds.length} Aset Grafis</div>
                  </div>
                </div>

                {/* Assigned Channels Pill List */}
                <div className="mt-3">
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase block mb-1.5">
                    Channel Terkait
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {assignedChannels.length === 0 ? (
                      <span className="text-neutral-500 text-xs italic">Belum ada channel yang ditugaskan.</span>
                    ) : (
                      assignedChannels.map((c) => (
                        <span
                          key={c.id}
                          className="px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 text-[11px] font-medium"
                        >
                          {c.title}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-neutral-800/60">
                <div className="flex gap-2">
                  <button
                    onClick={onNavigateToTitles}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium"
                  >
                    Master Judul
                  </button>
                  <button
                    onClick={onNavigateToThumbnails}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium"
                  >
                    Master Thumbnail
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(profile)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                    title="Ubah profil"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id, profile.name)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition"
                    title="Hapus profil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
              <h3 className="text-sm font-bold text-neutral-100">
                {editingProfile ? 'Edit Profil Konten' : 'Tambah Profil Konten'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Nama Profil Konten
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="contoh: AYAM WARNA"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Deskripsi Profil
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsikan gaya konten atau kategori niche..."
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              {/* Niche Category and Visual Badge Selector */}
              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-neutral-200 uppercase tracking-wider">
                    Kategori Niche Profil & Batas Rotasi
                  </label>
                  <NicheBadge
                    category={nicheCategory === 'CUSTOM' ? (customNiche || 'Kustom') : nicheCategory}
                    badgeKey={nicheBadge}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">
                  Mengisolasi rotasi modulo judul dan thumbnail sehingga aset dari profil ini tidak bercampur dengan niche lain.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Preset Kategori Niche</label>
                    <select
                      value={nicheCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNicheCategory(val);
                        const matched = NICHE_PRESETS.find((p) => p.category === val);
                        if (matched) {
                          setNicheBadge(matched.badgeKey);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
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
                      value={nicheBadge}
                      onChange={(e) => setNicheBadge(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                    >
                      <option value="amber">Amber (Kuning Emas)</option>
                      <option value="purple">Ungu (Violet Pekat)</option>
                      <option value="cyan">Sian (Biru Cerah)</option>
                      <option value="emerald">Zamrud (Hijau Sejuk)</option>
                      <option value="rose">Mawar (Merah Terang)</option>
                    </select>
                  </div>
                </div>

                {nicheCategory === 'CUSTOM' && (
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Nama Kategori Niche Kustom</label>
                    <input
                      type="text"
                      required
                      value={customNiche}
                      onChange={(e) => setCustomNiche(e.target.value)}
                      placeholder="contoh: Eksperimen Sains, Vlog Keseharian"
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-neutral-300 mb-2 uppercase tracking-wider">
                  Konfigurasi Jadwal Baku untuk Channel Terkait
                </label>
                <ScheduleConfigEditor
                  value={scheduleConfig}
                  onChange={(cfg) => setScheduleConfig(cfg)}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
