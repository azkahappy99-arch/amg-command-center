import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  ShieldCheck,
  Calendar,
  Layers,
  FileCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api.ts';

interface Phase2AcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId?: string;
  channelTitle?: string;
}

export const Phase2AcceptanceModal: React.FC<Phase2AcceptanceModalProps> = ({
  isOpen,
  onClose,
  channelId = 'chan-ayam-warna',
  channelTitle = '[DEMO FIXTURE] Ayam Warna',
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResponse, setTestResponse] = useState<{
    allPassed: boolean;
    totalTests: number;
    passedCount: number;
    failedCount: number;
    timestamp: string;
    results: Array<{
      testId: string;
      title: string;
      requirement: string;
      passed: boolean;
      details: string;
      data?: any;
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunTests = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await api.runPhase2AcceptanceTest(channelId);
      setTestResponse(res);
    } catch (err: any) {
      setError(err.message || 'Gagal menjalankan rangkaian uji penerimaan Fase 2.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-950/80 border border-red-800/80 text-red-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-100 uppercase tracking-tight flex items-center gap-2">
                Uji Penerimaan Kepatuhan Fase 2
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800/60">
                  Kebutuhan 32 & 33
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Verifikasi otomatis Kelayakan Aman, Pemisahan Batas Unggah, Matriks Rotasi &amp; Penjadwalan Berkelanjutan.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Target Channel Info */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Target Uji</span>
              <div className="text-sm font-bold text-neutral-200">{channelTitle}</div>
              <div className="text-[11px] text-neutral-400 font-mono">{channelId}</div>
            </div>
            <button
              onClick={handleRunTests}
              disabled={isRunning}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-50 shadow-lg shadow-red-950/40 cursor-pointer"
            >
              {isRunning ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  Menjalankan Pengujian...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Jalankan Uji Penerimaan
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300">
              <span className="font-bold">Kesalahan Eksekusi:</span> {error}
            </div>
          )}

          {/* Test Summary Banner */}
          {testResponse && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                testResponse.allPassed
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                  : 'bg-red-950/40 border-red-800/80 text-red-300'
              }`}
            >
              <div className="flex items-center gap-3">
                {testResponse.allPassed ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                ) : (
                  <XCircle className="w-7 h-7 text-red-400" />
                )}
                <div>
                  <div className="text-sm font-black uppercase tracking-wide">
                    {testResponse.allPassed ? 'SEMUA PENGUJIAN PENERIMAAN FASE 2 LOLOS' : 'BEBERAPA PENGUJIAN GAGAL'}
                  </div>
                  <div className="text-[11px] opacity-80">
                    Lolos {testResponse.passedCount} dari {testResponse.totalTests} pemeriksaan verifikasi.
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono opacity-60">
                {new Date(testResponse.timestamp).toLocaleTimeString('id-ID')}
              </span>
            </div>
          )}

          {/* Test Cases Checklist */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase text-neutral-400 tracking-wider">
              Daftar Kasus Uji Verifikasi
            </h3>

            {testResponse ? (
              testResponse.results.map((t) => (
                <div
                  key={t.testId}
                  className={`p-4 rounded-xl border transition ${
                    t.passed
                      ? 'bg-neutral-950/70 border-neutral-800 hover:border-emerald-800/60'
                      : 'bg-red-950/20 border-red-800/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {t.passed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-neutral-200">{t.title}</div>
                        <div className="text-[11px] text-neutral-400">{t.requirement}</div>
                        <div className="text-[11px] font-mono text-neutral-300 pt-1 bg-neutral-900/60 p-2 rounded-lg border border-neutral-800/50">
                          {t.details}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${
                        t.passed
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          : 'bg-red-950 text-red-400 border border-red-800/60'
                      }`}
                    >
                      {t.passed ? 'LOLOS' : 'GAGAL'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-neutral-500 bg-neutral-950/40 rounded-xl border border-dashed border-neutral-800">
                <Sparkles className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                Klik &quot;Jalankan Uji Penerimaan&quot; di atas untuk memverifikasi seluruh kepatuhan keamanan Fase 2, pemisahan batas unggah, rotasi judul &amp; thumbnail, serta penjadwalan berkelanjutan.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-400">
          <span>Kepatuhan Standar Mesin Aman AMG Fase 2</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
