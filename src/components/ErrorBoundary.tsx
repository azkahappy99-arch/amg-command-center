import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AMG ErrorBoundary] Uncaught runtime error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleResetCacheAndReload = () => {
    try {
      // Clear potentially corrupted local state while keeping essential settings
      const keysToRemove = [
        'amg_channels',
        'amg_persistent_channels',
        'amg_persistent_channels_list',
        'amg_videos',
        'amg_active_channel_id',
        'amg_active_channel',
        'amg_permanent_channel_ids',
      ];
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
      // Also clear any channel-specific videos/titles
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('amg_real_videos_') || key.startsWith('amg_master_titles_'))) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('[AMG ErrorBoundary] Error clearing cache:', e);
    }
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 sm:p-6 select-text">
          <div className="w-full max-w-xl rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-800/60 flex items-center justify-center text-red-400 shrink-0 shadow-lg shadow-red-950/50">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-red-950 text-red-400 border border-red-800/60">
                    ANTI-BLANK RECOVERY
                  </span>
                  <span className="text-xs text-neutral-500 font-mono">AMG RUNTIME GUARD</span>
                </div>
                <h1 className="text-lg sm:text-xl font-black text-neutral-100 tracking-tight mt-0.5">
                  Terjadi Kendala pada Tampilan
                </h1>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Sistem berhasil mendeteksi dan mengisolasi galat runtime sehingga layar aplikasi tidak menjadi putih kosong. Anda dapat mencoba memuat ulang tampilan atau memulihkan cache penyimpanan lokal.
            </p>

            {this.state.error && (
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs text-red-300 space-y-2 overflow-x-auto max-h-48 scrollbar-thin">
                <div className="font-bold flex items-center gap-1.5 text-red-400">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Pesan Kesalahan:</span>
                </div>
                <div className="break-all whitespace-pre-wrap text-[11px] text-neutral-300">
                  {this.state.error.message || String(this.state.error)}
                </div>
                {this.state.errorInfo?.componentStack && (
                  <details className="mt-2 text-[10px] text-neutral-500 cursor-pointer">
                    <summary className="hover:text-neutral-300 font-sans">Lihat Komponen Stack Trace</summary>
                    <pre className="mt-1 whitespace-pre-wrap text-[9px] text-neutral-400 font-mono">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer border border-neutral-700"
              >
                <RefreshCw className="w-3.5 h-3.5 text-neutral-300" />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                onClick={this.handleResetCacheAndReload}
                className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-red-950/60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Pulihkan & Bersihkan Cache</span>
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={this.handleRetry}
                className="text-[11px] text-neutral-500 hover:text-neutral-300 underline cursor-pointer"
              >
                Coba render ulang komponen tanpa refresh
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
