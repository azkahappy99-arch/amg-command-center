import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  ExternalLink,
  Eye,
  RotateCw,
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
  const [newUrl, setNewUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [matrixData, setMatrixData] = useState<any[]>([]);

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

  const handleAddThumbnail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    setIsAdding(true);
    try {
      await api.createMasterThumbnail({
        profileId: selectedProfileId,
        name: newName.trim(),
        url: newUrl.trim(),
        orderIndex: profileThumbnails.length,
      });
      setNewName('');
      setNewUrl('');
      onThumbnailsUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to add thumbnail');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (thumb: MasterThumbnail) => {
    if (!confirm(`Delete thumbnail "${thumb.name}"?`)) return;
    try {
      await api.deleteMasterThumbnail(thumb.id);
      onThumbnailsUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete thumbnail');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-red-500" />
            Master Thumbnails & Rotation Matrix
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Manage dynamic M Master Thumbnails. Titles (N) and Thumbnails (M) rotate independently according to modular arithmetic.
          </p>
        </div>

        {/* Profile Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-neutral-400 uppercase">Profile:</span>
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

      {/* Add Thumbnail Form */}
      <form
        onSubmit={handleAddThumbnail}
        className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3"
      >
        <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider block">
          Add Master Thumbnail Asset
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Thumbnail label (e.g. Cozy Rain Bedroom TH2)"
            className="lg:col-span-2 px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
          />
          <input
            type="url"
            required
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Image URL (https://...)"
            className="lg:col-span-2 px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
          />
          <button
            type="submit"
            disabled={isAdding}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-red-900/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Graphic</span>
          </button>
        </div>
      </form>

      {/* Thumbnails Gallery Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-neutral-300 uppercase tracking-wider">
          <span>Configured Master Thumbnails ({profileThumbnails.length})</span>
          <span className="text-neutral-500 font-normal">Independent modulo sequence</span>
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
                    Order Index: #{idx}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-neutral-800/60 mt-3">
                <span className="text-[10px] text-emerald-400 font-medium">Ready</span>
                <button
                  onClick={() => handleDelete(thumb)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition"
                  title="Delete thumbnail"
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
              Dynamic Rotation Matrix (Independent Titles & Thumbnails)
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Demonstrates how {profileTitles.length} Titles and {profileThumbnails.length} Thumbnails combine across sequential video uploads.
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 font-semibold self-start sm:self-auto">
            {profileTitles.length} Titles × {profileThumbnails.length} Thumbnails
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">Video Sequence</th>
                <th className="py-2.5 px-3">Assigned Master Title</th>
                <th className="py-2.5 px-3">Assigned Thumbnail</th>
                <th className="py-2.5 px-3">Title Modulo</th>
                <th className="py-2.5 px-3">Thumb Modulo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {matrixData.map((item, i) => (
                <tr key={i} className="hover:bg-neutral-800/30 transition font-mono">
                  <td className="py-2.5 px-3 font-bold text-neutral-200">
                    Video #{item.videoIndex + 1}
                  </td>
                  <td className="py-2.5 px-3 font-sans font-medium text-emerald-400">
                    {item.title?.text || `Title ${item.titleIndex + 1}`}
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
                      {item.thumbnail?.name || `Thumb ${item.thumbnailIndex + 1}`}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-neutral-400">
                    T{item.titleIndex + 1} ({item.titleIndex})
                  </td>
                  <td className="py-2.5 px-3 text-neutral-400">
                    TH{item.thumbnailIndex + 1} ({item.thumbnailIndex})
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
