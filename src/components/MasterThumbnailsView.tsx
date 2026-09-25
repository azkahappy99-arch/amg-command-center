import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  RotateCw,
  Upload,
  X,
  CheckCircle2,
} from 'lucide-react';
import { MasterThumbnail, MasterTitle, ContentProfile } from '../types/index.ts';
import { api } from '../services/api.ts';

interface MasterThumbnailsViewProps {
  thumbnails: MasterThumbnail[];
  titles: MasterTitle[];
  profiles: ContentProfile[];
  onThumbnailsUpdated: () => void;
}

export const MasterThumbnailsView: React.FC<MasterThumbnailsViewProps> = ({
  thumbnails,
  titles,
  profiles,
  onThumbnailsUpdated,
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(profiles[0]?.id || 'profile-ayam-warna');
  const [newName, setNewName] = useState('');
  const [selectedImageBase64, setSelectedImageBase64] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [matrixData, setMatrixData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileThumbnails = thumbnails
    .filter((th) => th.profileId === selectedProfileId)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const profileTitles = titles
    .filter((t) => t.profileId === selectedProfileId && t.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Load rotation matrix
  useEffect(() => {
    api
      .getRotationMatrix(selectedProfileId, 12)
      .then((res) => {
        if (res && res.matrix) {
          setMatrixData(res.matrix);
        }
      })
      .catch((err) => console.error(err));
  }, [selectedProfileId, thumbnails, titles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Silakan pilih file gambar yang valid (JPG, PNG, WEBP).');
      return;
    }

    // Set file name info
    setSelectedFileName(file.name);

    // Auto-populate label if currently empty
    if (!newName.trim()) {
      const baseTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setNewName(`Thumbnail ${baseTitle.slice(0, 40)}`);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setSelectedImageBase64(result);
      }
    };
    reader.onerror = () => {
      alert('Gagal membaca file gambar dari perangkat Anda.');
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setSelectedImageBase64('');
    setSelectedFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddThumbnail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      alert('Silakan isi label thumbnail.');
      return;
    }
    if (!selectedImageBase64) {
      alert('Silakan pilih file gambar dari galeri HP atau perangkat Anda terlebih dahulu.');
      return;
    }

    setIsAdding(true);
    try {
      await api.createMasterThumbnail({
        profileId: selectedProfileId,
        name: newName.trim(),
        url: selectedImageBase64,
        orderIndex: profileThumbnails.length,
      });
      setNewName('');
      handleClearImage();
      onThumbnailsUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menambahkan thumbnail');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (thumb: MasterThumbnail) => {
    if (!confirm(`Hapus thumbnail "${thumb.name}"?`)) return;
    try {
      await api.deleteMasterThumbnail(thumb.id);
      onThumbnailsUpdated();
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus thumbnail');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-red-500" />
            MASTER THUMBNAIL & MATRIKS ROTASI
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Kelola M Master Thumbnail dinamis. Judul (N) dan Thumbnail (M) berotasi secara independen berdasarkan aritmatika modular.
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

      {/* Add Thumbnail Form with Device Gallery File Upload */}
      <form
        onSubmit={handleAddThumbnail}
        className="p-4 sm:p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-lg shadow-black/40"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
            <Upload className="w-3.5 h-3.5 text-red-500" />
            TAMBAH ASET MASTER THUMBNAIL
          </span>
          <span className="text-[11px] text-neutral-400">
            Format: JPG, PNG, WEBP dari galeri perangkat
          </span>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="gallery-thumbnail-input"
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start">
          {/* Label Input */}
          <div className="lg:col-span-5 space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wide block">
              Label / Nama Thumbnail:
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Contoh: Thumbnail Ruang Tidur Hujan TH2"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs sm:text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500/50 focus:outline-none placeholder-neutral-500 transition"
            />
          </div>

          {/* Gallery Upload Button & Image Preview */}
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wide block">
              File Gambar dari Galeri:
            </label>
            {!selectedImageBase64 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[44px] sm:min-h-[40px] px-4 py-2.5 rounded-xl border border-dashed border-red-700/60 hover:border-red-500 bg-red-950/20 hover:bg-red-950/40 text-red-200 hover:text-white transition active:scale-[0.98] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer group shadow-sm shadow-red-950/30"
              >
                <Upload className="w-4 h-4 text-red-400 group-hover:scale-110 transition" />
                <span>Pilih Gambar dari Galeri</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-2 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="relative w-16 h-10 rounded-lg overflow-hidden border border-neutral-700 shrink-0 bg-neutral-900">
                  <img
                    src={selectedImageBase64}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Gambar dipilih</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {selectedFileName || 'Foto galeri siap'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-200 font-semibold transition"
                    title="Ganti Gambar"
                  >
                    Ganti
                  </button>
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="p-1 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
                    title="Hapus pilihan gambar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="lg:col-span-3 space-y-1.5">
            <label className="text-[11px] font-semibold text-transparent uppercase tracking-wide hidden lg:block select-none">
              Aksi
            </label>
            <button
              type="submit"
              disabled={isAdding || !newName.trim() || !selectedImageBase64}
              className={`w-full min-h-[44px] sm:min-h-[40px] px-4 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-md ${
                !newName.trim() || !selectedImageBase64
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700/50'
                  : 'bg-red-600 hover:bg-red-500 cursor-pointer shadow-red-900/30'
              }`}
            >
              {isAdding ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>+ Tambah Gambar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Selected Image Full Preview (if available) */}
        {selectedImageBase64 && (
          <div className="mt-2 pt-3 border-t border-neutral-800/80 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-[11px] font-semibold text-neutral-400 shrink-0">
              Pratinjau Asli:
            </span>
            <div className="relative max-w-xs aspect-video rounded-xl overflow-hidden border border-neutral-700 bg-neutral-950 shadow-md">
              <img
                src={selectedImageBase64}
                alt="Pratinjau Thumbnail Pilihan"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[9px] text-neutral-300 font-mono">
                16:9 Pratinjau
              </span>
            </div>
            <div className="text-[11px] text-neutral-400 space-y-0.5">
              <p className="text-neutral-200 font-medium">{newName || 'Nama Thumbnail Belum Diisi'}</p>
              <p>Gambar siap disimpan ke Master Thumbnail untuk rotasi modular otomatis.</p>
            </div>
          </div>
        )}
      </form>


      {/* Thumbnails Gallery Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-neutral-300 uppercase tracking-wider">
          <span>MASTER THUMBNAIL TERKONFIGURASI ({profileThumbnails.length})</span>
          <span className="text-neutral-500 font-normal">URUTAN MODULO INDEPENDEN</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {profileThumbnails.map((thumb, idx) => (
            <div
              key={thumb.id}
              className="p-3 rounded-2xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 flex flex-col justify-between transition group"
            >
              <div className="space-y-2">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800">
                  <img
                    src={thumb.url}
                    alt={thumb.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[10px] font-bold text-neutral-200">
                    TH{idx + 1}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-xs text-neutral-200 truncate">{thumb.name}</div>
                  <div className="text-[10px] text-neutral-500 truncate mt-0.5 font-mono">
                    Indeks Urutan: #{idx}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-neutral-800/60 mt-3">
                <span className="text-[10px] text-emerald-400 font-medium">Siap</span>
                <button
                  onClick={() => handleDelete(thumb)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition"
                  title="Hapus thumbnail"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic N Titles x M Thumbnails Rotation Matrix Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-neutral-800">
          <div>
            <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-red-500" />
              Matriks Rotasi Dinamis (Judul & Thumbnail Independen)
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Menampilkan kombinasi rotasi judul dan thumbnail pada antrean upload video.
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 font-semibold self-start sm:self-auto">
            {profileTitles.length} Judul × {profileThumbnails.length} Thumbnail
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">VIDEO</th>
                <th className="py-2.5 px-3">STATUS</th>
                <th className="py-2.5 px-3">DIJADWALKAN</th>
                <th className="py-2.5 px-3">JUDUL</th>
                <th className="py-2.5 px-3">THUMBNAIL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {matrixData.map((item, i) => (
                <tr key={i} className="hover:bg-neutral-800/30 transition font-mono">
                  <td className="py-2.5 px-3 font-bold text-neutral-200">
                    Video #{item.videoIndex + 1}
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800/40">
                      TERVERIFIKASI
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-sans text-neutral-300">
                    Urutan #{item.videoIndex + 1}
                  </td>
                  <td className="py-2.5 px-3 font-sans font-medium text-emerald-400">
                    {item.title?.text || `Judul ${item.titleIndex + 1}`}
                  </td>
                  <td className="py-2.5 px-3 font-sans flex items-center gap-2">
                    {item.thumbnail?.url && (
                      <img
                        src={item.thumbnail.url}
                        alt=""
                        className="w-10 h-6 rounded object-cover border border-neutral-700"
                      />
                    )}
                    <span className="text-neutral-300">
                      {item.thumbnail?.name || `Thumbnail ${item.thumbnailIndex + 1}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
