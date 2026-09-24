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
} from 'lucide-react';
import { SystemSettings } from '../types/index.ts';
import { api } from '../services/api.ts';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [publishTime, setPublishTime] = useState('16:00');
  const [frequency, setFrequency] = useState('1/day');
  const [syncInterval, setSyncInterval] = useState(30);
  const [maxRetries, setMaxRetries] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setTimezone(s.defaultTimezone);
      setPublishTime(s.defaultPublishTime);
      setFrequency(s.defaultFrequency);
      setSyncInterval(s.autoSyncIntervalMinutes);
      setMaxRetries(s.maxRetries);
    });
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
            Standar operasional, manajemen kuota YouTube Data API, dan panduan kredensial Google Cloud.
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
        {/* Left Column: Operational Defaults Form */}
        <form onSubmit={handleSave} className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2 pb-2 border-b border-neutral-800">
            <Clock className="w-4 h-4 text-red-500" />
            Parameter Standar Penjadwalan & Rotasi
          </h3>

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
          <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-200">Penggunaan Kuota YouTube Data API</span>
              <span className="font-mono text-neutral-400">
                {settings?.apiQuotaUsed || 1420} / {settings?.apiQuotaDailyLimit || 10000} unit
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full"
                style={{
                  width: `${((settings?.apiQuotaUsed || 1420) / (settings?.apiQuotaDailyLimit || 10000)) * 100}%`,
                }}
              />
            </div>
            <div className="text-[10.5px] text-neutral-500">
              Reset otomatis setiap hari tengah malam PST. Cukup untuk ~150 pembaruan video per hari.
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition active:scale-95 shadow-md shadow-red-900/30 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}</span>
          </button>
        </form>

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
