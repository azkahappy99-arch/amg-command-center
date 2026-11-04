import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Key,
  Globe,
  Clock,
  Save,
  CheckCircle2,
  ExternalLink,
  Layers,
  Database,
  Lock,
  RotateCcw,
  Server,
  Zap,
  Calendar,
} from 'lucide-react';
import { SystemSettings, ClientIdSlot } from '../types/index.ts';
import { api } from '../services/api.ts';
import {
  getClientIdPool,
  saveClientIdPool,
  parseClientIdsFromText,
  formatClientIdPoolToText,
  resetSlotCooldown,
} from '../utils/clientIdPoolUtils.ts';
import {
  getQuotaUsage,
  getQuotaUsageSync,
  QuotaTrackerData,
  DEFAULT_DAILY_LIMIT,
} from '../utils/quotaTracker.ts';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [publishTime, setPublishTime] = useState('16:00');
  const [frequency, setFrequency] = useState('1/day');
  const [syncInterval, setSyncInterval] = useState(30);
  const [maxRetries, setMaxRetries] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Client ID Pool state
  const [clientIdPoolText, setClientIdPoolText] = useState('');
  const [clientIdSlots, setClientIdSlots] = useState<ClientIdSlot[]>([]);
  const [isSavingPool, setIsSavingPool] = useState(false);
  const [poolSavedSuccess, setPoolSavedSuccess] = useState(false);

  // Realtime Quota Tracker state from 'amg_quota_tracker'
  const [quotaData, setQuotaData] = useState<QuotaTrackerData>(getQuotaUsageSync());

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setTimezone(s.defaultTimezone);
      setPublishTime(s.defaultPublishTime);
      setFrequency(s.defaultFrequency);
      setSyncInterval(s.autoSyncIntervalMinutes);
      setMaxRetries(s.maxRetries);
    });

    // Re-hydration Client ID Pool
    const pool = getClientIdPool();
    setClientIdSlots(pool);
    setClientIdPoolText(formatClientIdPoolToText(pool));

    // Baca langsung data dari 'amg_quota_tracker' (IndexedDB)
    getQuotaUsage().then(setQuotaData);

    const handleQuotaUpdate = (e: any) => {
      if (e.detail) {
        setQuotaData(e.detail);
      } else {
        getQuotaUsage().then(setQuotaData);
      }
    };

    window.addEventListener('amg_quota_updated', handleQuotaUpdate);
    window.addEventListener('storage', handleQuotaUpdate);
    return () => {
      window.removeEventListener('amg_quota_updated', handleQuotaUpdate);
      window.removeEventListener('storage', handleQuotaUpdate);
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);
    try {
      await api.updateSettings({
        defaultTimezone: timezone,
        defaultPublishTime: publishTime,
        defaultFrequency: frequency,
        autoSyncIntervalMinutes: Number(syncInterval),
        maxRetries: Number(maxRetries),
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePool = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPool(true);
    setPoolSavedSuccess(false);
    try {
      const newSlots = parseClientIdsFromText(clientIdPoolText, clientIdSlots);
      saveClientIdPool(newSlots);
      setClientIdSlots(newSlots);
      setPoolSavedSuccess(true);
      setTimeout(() => setPoolSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan pool Client ID');
    } finally {
      setIsSavingPool(false);
    }
  };

  const handleResetCooldown = (slotId: string) => {
    resetSlotCooldown(slotId);
    const updated = getClientIdPool();
    setClientIdSlots(updated);
  };

  const appUrl = window.location.origin;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-red-500" />
            Konfigurasi Sistem & Keamanan OAuth
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Standar operasional, manajemen kuota YouTube Data API, dan pool kredensial multi-project Google Cloud.
          </p>
        </div>

        {savedSuccess && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-800/50 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pengaturan Berhasil Disimpan!</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Operational Defaults Form & Client ID Pool */}
        <div className="space-y-6">
          <form onSubmit={handleSave} className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
            <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2 pb-2 border-b border-neutral-800">
              <Clock className="w-4 h-4 text-red-500" />
              Parameter Standar Penjadwalan & Rotasi
            </h3>

            {/* Global Weekly Schedule Preset Banner */}
            <div className="p-3.5 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-neutral-200">
                  Pola Jadwal Mingguan Otomatis: Min (15.00) | Sen-Kam (16.00) | Jum (14.30) | Sab (15.30) WIB
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed pl-6">
                Preset ini otomatis berlaku untuk semua channel, kecuali jika channel tertentu diatur dengan jam kustom mandiri di menu Penyelarasan Jadwal.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                Zona Waktu Utama Sistem
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB — UTC+7)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA — UTC+8)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT — UTC+9)</option>
                <option value="UTC">UTC (Coordinated Universal Time)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Waktu Tayang Standar (WIB)
                </label>
                <input
                  type="time"
                  value={publishTime}
                  onChange={(e) => setPublishTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Frekuensi Publikasi Standar
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
                >
                  <option value="1/day">1 Video / Hari</option>
                  <option value="2/day">2 Video / Hari</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Interval Sinkron Otomatis (Menit)
                </label>
                <input
                  type="number"
                  min="5"
                  max="360"
                  value={syncInterval}
                  onChange={(e) => setSyncInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Batas Coba Ulang Otomasi (Retries)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Quota Gauge */}
            {(() => {
              const currentUsedQuota = quotaData.usedQuota;
              const currentDailyLimit = quotaData.dailyLimit || DEFAULT_DAILY_LIMIT;
              const quotaPercent = Math.min(100, Math.max(0, (currentUsedQuota / currentDailyLimit) * 100));

              return (
                <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span>Penggunaan Kuota YouTube Data API</span>
                    </span>
                    <span className="font-mono font-bold text-neutral-100 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800">
                      {currentUsedQuota} / {currentDailyLimit} unit
                    </span>
                  </div>

                  {/* Progress bar dinamis sesuai persentase kuota yang terpakai */}
                  <div className="space-y-1.5">
                    <div className="w-full h-2.5 rounded-full bg-neutral-800 overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          quotaPercent >= 90
                            ? 'bg-rose-500'
                            : quotaPercent >= 75
                            ? 'bg-amber-500'
                            : 'bg-gradient-to-r from-emerald-500 to-amber-500'
                        }`}
                        style={{
                          width: `${quotaPercent}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                      <span>{quotaPercent.toFixed(1)}% terpakai</span>
                      <span>
                        Sisa: {Math.max(0, currentDailyLimit - currentUsedQuota)} unit (~{Math.floor(Math.max(0, currentDailyLimit - currentUsedQuota) / 100)} video)
                      </span>
                    </div>
                  </div>

                  <div className="text-[10.5px] text-neutral-500 pt-1 border-t border-neutral-800/60 flex items-center justify-between">
                    <span>Reset otomatis setiap hari tengah malam PST ({quotaData.lastDatePst}). Estimasi: 100 unit/video (thumbnails.set + videos.update).</span>
                  </div>
                </div>
              );
            })()}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition active:scale-95 shadow-md shadow-red-900/30 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
            </button>
          </form>

          {/* Kartu Form: Daftar Kredensial Multi-Project (Client ID Pool) */}
          <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-rose-500" />
                <span>Daftar Kredensial Multi-Project (Client ID Pool)</span>
              </h3>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-neutral-800 text-neutral-200 border border-neutral-700">
                Status Pool: {clientIdSlots.length} Project Terdaftar
              </span>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Tempelkan daftar Google Client ID dari berbagai project Google Cloud (1 baris per Client ID). Sistem AMG akan otomatis memasangkan slot kredensial yang masih segar saat menautkan channel baru dan memutar slot jika batas kuota harian (10.000 unit) tercapai.
            </p>

            <form onSubmit={handleSavePool} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Daftar Client ID (1 baris per Client ID)
                </label>
                <textarea
                  value={clientIdPoolText}
                  onChange={(e) => setClientIdPoolText(e.target.value)}
                  placeholder="Contoh:&#10;101905273449-abcdef123.apps.googleusercontent.com&#10;101905273449-xyz987654.apps.googleusercontent.com&#10;101905273449-qwertyui.apps.googleusercontent.com"
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs font-mono focus:ring-1 focus:ring-rose-500 focus:outline-none placeholder-neutral-600 resize-y"
                />
              </div>

              {poolSavedSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Daftar Pool Kredensial Berhasil Disimpan ({clientIdSlots.length} Project)!</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingPool}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition active:scale-95 border border-neutral-700 cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span>{isSavingPool ? 'Menyimpan Pool...' : 'Simpan Daftar Pool Kredensial'}</span>
              </button>
            </form>

            {/* Status Slot Proyek Terdaftar */}
            {clientIdSlots.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-neutral-800/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Daftar Slot Project Aktif
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {clientIdSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-neutral-200">{slot.id}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                              slot.isCooldown
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : slot.assignedChannelId
                                ? 'bg-blue-950 text-blue-300 border-blue-800'
                                : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            }`}
                          >
                            {slot.isCooldown ? 'Cooldown' : slot.assignedChannelId ? 'Terpakai' : 'Siap Pakai'}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-neutral-500 truncate mt-0.5">
                          {slot.clientId}
                        </div>
                      </div>

                      {slot.isCooldown && (
                        <button
                          type="button"
                          onClick={() => handleResetCooldown(slot.id)}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 flex items-center gap-1 transition cursor-pointer shrink-0"
                          title="Reset cooldown slot ini"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-400" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Google OAuth Setup Guide */}
        <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2 pb-2 border-b border-neutral-800">
            <Shield className="w-4 h-4 text-emerald-400" />
            Panduan Pengaturan Google Cloud Console & YouTube OAuth
          </h3>

          <p className="text-xs text-neutral-300 leading-relaxed">
            Untuk mengotorisasi mutasi langsung YouTube Data API di seluruh channel YouTube Anda, ikuti langkah standar berikut:
          </p>

          <ol className="list-decimal list-inside space-y-2.5 text-xs text-neutral-400 leading-relaxed">
            <li>
              Buka{' '}
              <a
                href="https://console.cloud.google.com"
                target="_blank"
                rel="noreferrer"
                className="text-red-400 hover:underline inline-flex items-center gap-0.5"
              >
                <span>Google Cloud Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              lalu buat atau pilih proyek GCP Anda.
            </li>
            <li>
              Buka menu <strong>APIs & Services → Library</strong> dan aktifkan{' '}
              <span className="text-neutral-200 font-semibold">YouTube Data API v3</span>.
            </li>
            <li>
              Konfigurasikan <strong>OAuth Consent Screen</strong>:
              <ul className="list-disc list-inside ml-4 mt-1 text-[11px] text-neutral-400 space-y-0.5">
                <li>Nama aplikasi: <code className="text-neutral-300">AMG — Azka Media Group</code></li>
                <li>Scope: <code className="text-red-400">https://www.googleapis.com/auth/youtube.force-ssl</code></li>
              </ul>
            </li>
            <li>
              Masuk ke <strong>Credentials → Create Credentials → OAuth Client ID</strong>:
              <ul className="list-disc list-inside ml-4 mt-1 text-[11px] text-neutral-400 space-y-0.5">
                <li>Jenis aplikasi: <strong>Web application</strong></li>
                <li>URI pengalihan sah (Authorized redirect URI): <code className="text-neutral-300 font-mono text-[10px] break-all">{appUrl}/api/auth/youtube/callback</code></li>
              </ul>
            </li>
            <li>
              Pasang kredensial yang didapat pada environment server Anda:
              <div className="mt-1.5 p-2 rounded-lg bg-neutral-950 font-mono text-[11px] text-neutral-300 space-y-0.5">
                <div>GOOGLE_CLIENT_ID="your_client_id.apps.googleusercontent.com"</div>
                <div>GOOGLE_CLIENT_SECRET="your_client_secret"</div>
                <div>YOUTUBE_API_KEY="AIzaSy..."</div>
              </div>
            </li>
          </ol>

          <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Lock className="w-3.5 h-3.5" />
              Jaminan Keamanan Token Tanpa Kebocoran
            </div>
            <p className="text-[10.5px]">
              AMG mengisolasi seluruh token di sisi server. Tidak ada refresh token, secret, atau token bearer yang disimpan di cookie browser, sessionStorage, maupun localStorage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
