import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Key,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Tv,
  Users,
  Video,
} from 'lucide-react';
import { Channel } from '../types/index.ts';
import { api } from '../services/api.ts';
import {
  GIS_CONFIG,
  authorizeAndFetchYouTubeChannel,
  storeGisToken,
  YouTubeChannelSnippet,
} from '../services/youtubeGisAuth.ts';

interface YouTubeOAuthModalProps {
  channel: Channel | null;
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export const YouTubeOAuthModal: React.FC<YouTubeOAuthModalProps> = ({
  channel,
  isOpen,
  onClose,
  onConnected,
}) => {
  const [isGisAuthorizing, setIsGisAuthorizing] = useState(false);
  const [retrievedChannel, setRetrievedChannel] = useState<YouTubeChannelSnippet | null>(null);

  // Manual fallback state
  const [accountEmail, setAccountEmail] = useState('azkahappy99@gmail.com');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [showManualSection, setShowManualSection] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setRetrievedChannel(null);
      setIsGisAuthorizing(false);
    }
  }, [isOpen, channel]);

  if (!isOpen || !channel) return null;

  /**
   * Primary GIS Interactive Authorization
   */
  const handleGisAuthorize = async () => {
    setIsGisAuthorizing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Initialize google.accounts.oauth2.initTokenClient & open popup for consent
      // 2. Fetch from https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true
      const result = await authorizeAndFetchYouTubeChannel(true);
      setRetrievedChannel(result.channel);

      // 3. Persist to backend and update channel to CONNECTED
      const syncRes = await api.gisSyncChannel({
        channelId: channel.id,
        accessToken: result.accessToken,
        channelData: result.channel,
      });

      setSuccessMessage(
        syncRes.message ||
          `Channel "${result.channel.title}" berhasil dihubungkan! Status kini CONNECTED.`
      );

      setTimeout(() => {
        onConnected();
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('[GIS OAuth Error]', err);
      setErrorMessage(
        err.message ||
          'Gagal mengotorisasi akun Google melalui Google Identity Services. Pastikan popup tidak diblokir.'
      );
    } finally {
      setIsGisAuthorizing(false);
    }
  };

  /**
   * Manual token validation fallback
   */
  const handleConnectManualCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingManual(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!accessToken && !refreshToken) {
      setErrorMessage('Harap masukkan Access Token atau Refresh Token YouTube OAuth yang valid.');
      setIsSubmittingManual(false);
      return;
    }

    try {
      const res = await api.connectYouTubeCredentials({
        channelId: channel.id,
        accountEmail: accountEmail || 'azkahappy99@gmail.com',
        accessToken: accessToken.trim(),
        refreshToken: refreshToken.trim(),
      });

      if (accessToken) {
        storeGisToken(accessToken.trim(), 3600);
      }

      setSuccessMessage(res.message || 'Akun YouTube berhasil diverifikasi dan terhubung!');
      setTimeout(() => {
        onConnected();
        onClose();
      }, 1400);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengotorisasi kredensial.');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-red-950/70 border border-red-800/50 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.2)]">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                Otorisasi YouTube Data API v3 (GIS)
              </h3>
              <p className="text-xs text-neutral-400">Channel Target: {channel.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-neutral-300">
          {/* Status Messages */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Kendala Otorisasi:</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/70 text-emerald-200 text-xs flex items-start gap-2.5 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <div className="relative flex h-3 w-3 mt-1 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
              </div>
              <div className="flex-1">
                <span className="font-bold block mb-0.5 text-emerald-300">Berhasil Terhubung!</span>
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          {/* Retrieved Channel Card Preview */}
          {retrievedChannel && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-neutral-950 to-neutral-900 border border-emerald-500/40 space-y-3">
              <div className="flex items-center gap-3">
                {retrievedChannel.thumbnailUrl ? (
                  <img
                    src={retrievedChannel.thumbnailUrl}
                    alt={retrievedChannel.title}
                    className="w-12 h-12 rounded-full object-cover border border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white font-bold">
                    {retrievedChannel.title.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-sm truncate">{retrievedChannel.title}</h4>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 font-mono truncate">
                    {retrievedChannel.customUrl || retrievedChannel.id}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800 text-[11px]">
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <Users className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Subscribers: <strong className="text-white">{retrievedChannel.subscriberCount.toLocaleString()}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <Video className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Total Video: <strong className="text-white">{retrievedChannel.videoCount.toLocaleString()}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* GIS Interactive Flow */}
          <div className="p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-100 flex items-center gap-2 text-xs">
                  <Sparkles className="w-4 h-4 text-red-500" />
                  Google Identity Services (Client-Side)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800/40">
                  Resmi Google
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Login ke akun YouTube pemilik channel secara langsung melalui popup aman Google Identity Services. AMG mengambil informasi channel dan mengubah indikator menjadi <strong className="text-emerald-400">CONNECTED</strong> dengan lampu neon hijau aktif.
              </p>
            </div>

            {/* GIS Config Details Badge */}
            <div className="p-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-[10px] font-mono text-neutral-400 space-y-1">
              <div className="flex items-center justify-between truncate">
                <span className="text-neutral-500">Client ID:</span>
                <span className="text-neutral-300 truncate max-w-[260px]">{GIS_CONFIG.CLIENT_ID}</span>
              </div>
              <div className="flex items-center justify-between truncate">
                <span className="text-neutral-500">Scope:</span>
                <span className="text-neutral-300 truncate max-w-[260px]">{GIS_CONFIG.SCOPE}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGisAuthorize}
              disabled={isGisAuthorizing}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-red-900/30 transition-all active:scale-[0.98] cursor-pointer"
            >
              {isGisAuthorizing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Menghubungkan ke Akun Google...</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>Otorisasi OAuth Google (Popup GIS)</span>
                </>
              )}
            </button>
          </div>

          {/* Toggle Manual / Advanced Fallback */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowManualSection(!showManualSection)}
              className="text-[11px] text-neutral-500 hover:text-neutral-300 transition flex items-center gap-1 cursor-pointer"
            >
              <span>{showManualSection ? 'Sembunyikan Opsi Manual Token' : 'Opsi Lanjutan: Masukkan Token Manual'}</span>
            </button>

            {showManualSection && (
              <form onSubmit={handleConnectManualCredentials} className="mt-3 p-4 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                    Email Akun Google
                  </label>
                  <input
                    type="email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    placeholder="azkahappy99@gmail.com"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                    Access Token (ya29...)
                  </label>
                  <input
                    type="text"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="ya29.a0..."
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 text-xs font-mono focus:ring-1 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                    Refresh Token (Opsional)
                  </label>
                  <input
                    type="password"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="1//04..."
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-100 text-xs font-mono focus:ring-1 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isSubmittingManual ? 'Memverifikasi...' : 'Verifikasi Token Manual'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
