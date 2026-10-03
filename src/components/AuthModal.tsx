import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Lock,
  Mail,
  User,
  CheckCircle2,
  AlertTriangle,
  X,
  Smartphone,
  Laptop,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  Crown,
  UserCheck,
  Send,
  ShieldCheck,
  Cpu,
  Copy,
  Check,
} from 'lucide-react';

export interface UserSessionData {
  id: string;
  email: string;
  role: 'PRIMARY_OWNER' | 'USER';
  workspaceId: string;
  status: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface ActiveSession {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

export interface PendingAccessRequest {
  id: string;
  email: string;
  requestedAt: string;
  expiresAt: string;
  accessCode: string;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserSessionData | null;
  isOwnerProvisioned: boolean;
  onAuthSuccess: (token: string, user: UserSessionData) => void;
  onLogout: () => void;
}

type AuthTab = 'OWNER_LOGIN' | 'OWNER_SETUP' | 'USER_AUTH' | 'SESSIONS' | 'USER_REQUESTS';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isOwnerProvisioned,
  onAuthSuccess,
  onLogout,
}) => {
  const [tab, setTab] = useState<AuthTab>(
    !isOwnerProvisioned ? 'OWNER_SETUP' : currentUser ? 'SESSIONS' : 'OWNER_LOGIN'
  );

  // Owner Setup Form
  const [setupMasterGmail, setSetupMasterGmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupMasterKey, setSetupMasterKey] = useState('');
  const [setupConfirmMasterKey, setSetupConfirmMasterKey] = useState('');
  const [setupBootstrapToken, setSetupBootstrapToken] = useState('');
  const [showSetupSecret, setShowSetupSecret] = useState(false);

  // Owner Login Form
  const [ownerGmail, setOwnerGmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showOwnerSecret, setShowOwnerSecret] = useState(false);

  // Master Key Recovery Mode
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryMasterKey, setRecoveryMasterKey] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');

  // User Auth Form
  const [userMode, setUserMode] = useState<'LOGIN' | 'REQUEST' | 'REGISTER'>('LOGIN');
  const [userEmail, setUserEmail] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userConfirmPassword, setUserConfirmPassword] = useState('');
  const [userAccessCode, setUserAccessCode] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);

  // Active Sessions
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Pending Access Requests (for Primary Owner review)
  const [pendingRequests, setPendingRequests] = useState<PendingAccessRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOwnerProvisioned) {
      setTab('OWNER_SETUP');
      // Auto fetch dev bootstrap token if available
      fetch('/api/auth/bootstrap/token')
        .then((res) => res.json())
        .then((data) => {
          if (data.bootstrapToken) {
            setSetupBootstrapToken(data.bootstrapToken);
          }
        })
        .catch(() => {});
    } else if (currentUser) {
      setTab('SESSIONS');
      loadSessions();
      if (currentUser.role === 'PRIMARY_OWNER') {
        loadPendingRequests();
      }
    } else {
      setTab('OWNER_LOGIN');
    }
  }, [isOwnerProvisioned, currentUser, isOpen]);

  const loadSessions = async () => {
    const token = localStorage.getItem('amg_auth_token');
    if (!token) return;
    setIsLoadingSessions(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const clearMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  // 1. Initial Owner Setup Handler
  const handleOwnerSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (setupPassword !== setupConfirmPassword) {
      setErrorMsg('Owner Password dan konfirmasi tidak cocok.');
      return;
    }
    if (setupMasterKey !== setupConfirmMasterKey) {
      setErrorMsg('Master Key dan konfirmasi tidak cocok.');
      return;
    }
    if (setupPassword.length < 8) {
      setErrorMsg('Owner Password minimal 8 karakter.');
      return;
    }
    if (setupMasterKey.length < 8) {
      setErrorMsg('Master Key minimal 8 karakter.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/owner/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterGmail: setupMasterGmail,
          password: setupPassword,
          confirmPassword: setupConfirmPassword,
          masterKey: setupMasterKey,
          confirmMasterKey: setupConfirmMasterKey,
          bootstrapToken: setupBootstrapToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal melakukan Initial Owner Setup.');
      }

      setSuccessMsg('PRIMARY OWNER berhasil dibuat! Setup permanen dikunci.');
      localStorage.setItem('amg_auth_token', data.token);
      onAuthSuccess(data.token, data.user);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Owner Daily Login Handler (Cukup Master Gmail + Owner Password)
  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterGmail: ownerGmail,
          password: ownerPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal masuk sebagai Primary Owner.');
      }

      setSuccessMsg('Login Primary Owner berhasil.');
      localStorage.setItem('amg_auth_token', data.token);
      onAuthSuccess(data.token, data.user);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Autentikasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  // 2b. Owner Recovery Handler (Reset Password dengan Master Key)
  const handleOwnerRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setErrorMsg('Password baru dan konfirmasi tidak cocok.');
      return;
    }
    if (recoveryNewPassword.length < 8) {
      setErrorMsg('Password baru minimal 8 karakter.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/owner/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterGmail: ownerGmail,
          masterKey: recoveryMasterKey,
          newPassword: recoveryNewPassword,
          confirmNewPassword: recoveryConfirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mereset password dengan Master Key.');
      }

      setSuccessMsg('Password berhasil direset! Anda telah masuk sebagai Primary Owner.');
      localStorage.setItem('amg_auth_token', data.token);
      onAuthSuccess(data.token, data.user);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Pemulihan gagal.');
    } finally {
      setLoading(false);
    }
  };

  // 3. User Login & Access Flow
  const handleUserRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/user/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal meminta akses.');

      setSuccessMsg(data.message || 'Permintaan akses terkirim ke Primary Owner.');
      setUserMode('REGISTER');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal meminta akses.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserVerifyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (userPassword !== userConfirmPassword) {
      setErrorMsg('Password dan konfirmasi password tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/user/verify-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          username: userUsername.trim() || undefined,
          accessCode: userAccessCode,
          password: userPassword,
          confirmPassword: userConfirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal verifikasi kode aktivasi.');

      setSuccessMsg('Registrasi berhasil! Akun User aktif dengan workspace terisolasi.');
      localStorage.setItem('amg_auth_token', data.token);
      onAuthSuccess(data.token, data.user);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registrasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: userEmail.trim(),
          email: userEmail.trim(),
          password: userPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Email atau password user salah.');

      setSuccessMsg('Login User berhasil.');
      localStorage.setItem('amg_auth_token', data.token);
      onAuthSuccess(data.token, data.user);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };

  // Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    const token = localStorage.getItem('amg_auth_token');
    if (!token) return;

    try {
      const res = await fetch('/api/auth/sessions/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch {
      // ignore
    }
  };

  // Pending User Access Requests (for Primary Owner review)
  const loadPendingRequests = async () => {
    const token = localStorage.getItem('amg_auth_token');
    if (!token || currentUser?.role !== 'PRIMARY_OWNER') return;
    setIsLoadingRequests(true);
    try {
      const res = await fetch('/api/auth/owner/pending-requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const handleRevokeRequest = async (requestId: string) => {
    const token = localStorage.getItem('amg_auth_token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/owner/revoke-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        setSuccessMsg('Permintaan akses user berhasil dibatalkan.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membatalkan permintaan akses.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-red-950/40">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-neutral-100 flex items-center gap-2">
                <span>AMG SECURITY & ACCESS CONTROL</span>
                {currentUser?.role === 'PRIMARY_OWNER' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-400" />
                    PRIMARY OWNER
                  </span>
                )}
                {currentUser?.role === 'USER' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                    USER
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-neutral-400">
                Pusat Autentikasi Pemilik Utama, Hak Akses & Isolasi Workspace
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center border-b border-neutral-800 bg-neutral-950/40 px-3 pt-2 gap-1.5 overflow-x-auto">
          {!isOwnerProvisioned ? (
            <button
              onClick={() => {
                setTab('OWNER_SETUP');
                clearMessages();
              }}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                tab === 'OWNER_SETUP'
                  ? 'border-red-500 text-white bg-neutral-800/80'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
              <span>Initial Owner Setup</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setTab('OWNER_LOGIN');
                  clearMessages();
                }}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                  tab === 'OWNER_LOGIN'
                    ? 'border-amber-500 text-white bg-neutral-800/80'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Owner Login</span>
              </button>

              <button
                onClick={() => {
                  setTab('USER_AUTH');
                  clearMessages();
                }}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                  tab === 'USER_AUTH'
                    ? 'border-cyan-500 text-white bg-neutral-800/80'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Akses User</span>
              </button>

              {currentUser && (
                <button
                  onClick={() => {
                    setTab('SESSIONS');
                    clearMessages();
                    loadSessions();
                  }}
                  className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                    tab === 'SESSIONS'
                      ? 'border-emerald-500 text-white bg-neutral-800/80'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sesi Perangkat ({sessions.length})</span>
                </button>
              )}

              {currentUser?.role === 'PRIMARY_OWNER' && (
                <button
                  onClick={() => {
                    setTab('USER_REQUESTS');
                    clearMessages();
                    loadPendingRequests();
                  }}
                  className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition flex items-center gap-1.5 cursor-pointer border-b-2 ${
                    tab === 'USER_REQUESTS'
                      ? 'border-amber-500 text-white bg-neutral-800/80'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Otorisasi User</span>
                  {pendingRequests.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-600 text-white font-black animate-pulse">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: INITIAL OWNER SETUP */}
          {tab === 'OWNER_SETUP' && (
            <form onSubmit={handleOwnerSetup} className="space-y-3.5">
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-amber-300 mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Inisialisasi Pemilik Utama AMG Command Center</span>
                </div>
                Masukkan Master Gmail, Owner Password, dan Master Key Anda sendiri. Form ini hanya dapat dijalankan <strong>SATU KALI</strong>. Setelah terdaftar, hak PRIMARY OWNER terkunci dan tidak dapat diambil alih.
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Master / Owner Gmail <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                  <input
                    type="email"
                    required
                    value={setupMasterGmail}
                    onChange={(e) => setSetupMasterGmail(e.target.value)}
                    placeholder="nama.owner@gmail.com"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Owner Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      type={showSetupSecret ? 'text' : 'password'}
                      required
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Min. 8 karakter"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Konfirmasi Owner Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type={showSetupSecret ? 'text' : 'password'}
                    required
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="Ulangi password"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Master Key (Kunci Sekuritas)</span> <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      type={showSetupSecret ? 'text' : 'password'}
                      required
                      value={setupMasterKey}
                      onChange={(e) => setSetupMasterKey(e.target.value)}
                      placeholder="Kunci recovery rahasia"
                      className="w-full bg-neutral-950 border border-amber-900/60 rounded-xl pl-9 pr-3 py-2 text-xs text-amber-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-300 mb-1">
                    Konfirmasi Master Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    type={showSetupSecret ? 'text' : 'password'}
                    required
                    value={setupConfirmMasterKey}
                    onChange={(e) => setSetupConfirmMasterKey(e.target.value)}
                    placeholder="Ulangi Master Key"
                    className="w-full bg-neutral-950 border border-amber-900/60 rounded-xl px-3 py-2 text-xs text-amber-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-neutral-300">
                    Bootstrap Authorization Token <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSetupSecret(!showSetupSecret)}
                    className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {showSetupSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showSetupSecret ? 'Sembunyikan Nilai' : 'Perlihatkan Nilai'}</span>
                  </button>
                </div>
                <div className="relative">
                  <Cpu className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                  <input
                    type="text"
                    required
                    value={setupBootstrapToken}
                    onChange={(e) => setSetupBootstrapToken(e.target.value)}
                    placeholder="Token server-side bootstrap"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  Token otorisasi satu kali server untuk mencegah provisioning liar dari pihak lain.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-950/50 transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Tetapkan Sebagai Primary Owner</span>
              </button>
            </form>
          )}

          {/* TAB 2: OWNER LOGIN & RECOVERY */}
          {tab === 'OWNER_LOGIN' && (
            <div>
              {!isRecoveryMode ? (
                <form onSubmit={handleOwnerLogin} className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 leading-relaxed">
                    <span className="font-bold text-amber-400">Login Harian Pemilik Utama:</span> Masuk menggunakan kombinasi <strong>Master Gmail</strong> dan <strong>Owner Password</strong> untuk akses praktis di HP maupun Laptop tanpa ribet.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Master Gmail
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type="email"
                        required
                        value={ownerGmail}
                        onChange={(e) => setOwnerGmail(e.target.value)}
                        placeholder="nama.owner@gmail.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-neutral-300">
                        Owner Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowOwnerSecret(!showOwnerSecret)}
                        className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {showOwnerSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showOwnerSecret ? 'Sembunyikan' : 'Perlihatkan'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type={showOwnerSecret ? 'text' : 'password'}
                        required
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder="Masukkan password Anda"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 shadow-lg shadow-amber-950/50 transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2 font-mono"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin text-neutral-950" /> : <Crown className="w-4 h-4" />}
                    <span>Masuk Sebagai PRIMARY OWNER</span>
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        clearMessages();
                        setIsRecoveryMode(true);
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-2 cursor-pointer transition flex items-center justify-center gap-1.5 mx-auto"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Lupa Password? Gunakan Master Key (Recovery Key)</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleOwnerRecover} className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-xs text-amber-200 leading-relaxed">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                      <Key className="w-4 h-4" />
                      <span>Pemulihan Darurat Akun (Master Key)</span>
                    </span>
                    Gunakan Master Key Anda untuk mereset Owner Password jika Anda lupa atau berpindah perangkat baru.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Master Gmail
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type="email"
                        required
                        value={ownerGmail}
                        onChange={(e) => setOwnerGmail(e.target.value)}
                        placeholder="nama.owner@gmail.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      <span>Master Key (Recovery Key)</span>
                    </label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type="password"
                        required
                        value={recoveryMasterKey}
                        onChange={(e) => setRecoveryMasterKey(e.target.value)}
                        placeholder="Masukkan Master Key Anda"
                        className="w-full bg-neutral-950 border border-amber-900/70 rounded-xl pl-9 pr-3 py-2 text-xs text-amber-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Password Baru (Min. 8)
                      </label>
                      <input
                        type="password"
                        required
                        value={recoveryNewPassword}
                        onChange={(e) => setRecoveryNewPassword(e.target.value)}
                        placeholder="Password baru"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Konfirmasi Password
                      </label>
                      <input
                        type="password"
                        required
                        value={recoveryConfirmPassword}
                        onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-red-600 via-amber-600 to-yellow-600 hover:from-red-500 hover:to-yellow-500 text-white shadow-lg shadow-amber-950/50 transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2 font-mono"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>Reset Password & Masuk</span>
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        clearMessages();
                        setIsRecoveryMode(false);
                      }}
                      className="text-xs text-neutral-400 hover:text-white underline underline-offset-2 cursor-pointer transition"
                    >
                      ← Kembali ke Login Harian (Master Gmail + Password)
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: USER AUTH & REGISTRATION */}
          {tab === 'USER_AUTH' && (
            <div className="space-y-4">
              <div className="flex rounded-xl bg-neutral-950 p-1 border border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setUserMode('LOGIN');
                    clearMessages();
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    userMode === 'LOGIN' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Login User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMode('REQUEST');
                    clearMessages();
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    userMode === 'REQUEST' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Minta Akses Baru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMode('REGISTER');
                    clearMessages();
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    userMode === 'REGISTER' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Verifikasi Kode
                </button>
              </div>

              {/* Mode: Login User */}
              {userMode === 'LOGIN' && (
                <form onSubmit={handleUserLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Email atau Username AMG
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type="text"
                        required
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="pengguna@contoh.com atau username AMG"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Password Pengguna
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type={showUserPassword ? 'text' : 'password'}
                        required
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Password akun Anda"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    <span>Masuk ke User Workspace</span>
                  </button>
                </form>
              )}

              {/* Mode: Request Access */}
              {userMode === 'REQUEST' && (
                <form onSubmit={handleUserRequestAccess} className="space-y-3">
                  <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 leading-relaxed">
                    Pengguna baru wajib meminta kode otorisasi satu kali. Kode akan diantarkan kepada Primary Owner untuk persetujuan.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Email Anda yang Ingin Diberikan Akses
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                      <input
                        type="email"
                        required
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="email.anda@gmail.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Kirim Permintaan Akses</span>
                  </button>
                </form>
              )}

              {/* Mode: Register with Code */}
              {userMode === 'REGISTER' && (
                <form onSubmit={handleUserVerifyRegister} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        required
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="email.anda@gmail.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Username AMG (Opsional)
                      </label>
                      <input
                        type="text"
                        value={userUsername}
                        onChange={(e) => setUserUsername(e.target.value)}
                        placeholder="contoh: user_azka"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-cyan-300 mb-1">
                      Kode Aktivasi (6 Digit)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={userAccessCode}
                      onChange={(e) => setUserAccessCode(e.target.value.trim())}
                      placeholder="Contoh: 849201"
                      className="w-full bg-neutral-950 border border-cyan-800 rounded-xl px-3 py-2 text-xs text-cyan-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-400 font-mono tracking-widest text-center font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Buat Password
                      </label>
                      <input
                        type={showUserPassword ? 'text' : 'password'}
                        required
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="Min. 8 karakter"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Konfirmasi Password
                      </label>
                      <input
                        type={showUserPassword ? 'text' : 'password'}
                        required
                        value={userConfirmPassword}
                        onChange={(e) => setUserConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-cyan-600 hover:bg-cyan-500 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>Aktivasi Akun User</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: ACTIVE SESSIONS (MULTI-DEVICE MONITORING) */}
          {tab === 'SESSIONS' && currentUser && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-amber-600 flex items-center justify-center text-white font-black text-sm">
                    {currentUser.role === 'PRIMARY_OWNER' ? '👑' : '👤'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{currentUser.email}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                        {currentUser.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      Workspace: <span className="font-mono">{currentUser.workspaceId}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    localStorage.removeItem('amg_auth_token');
                    onLogout();
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Daftar Perangkat Terhubung (Multi-Device)</span>
                  </h3>
                  <button
                    onClick={loadSessions}
                    className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingSessions ? 'animate-spin' : ''}`} />
                    <span>Perbarui</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {sessions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-500 rounded-xl bg-neutral-950/60 border border-neutral-850">
                      Tidak ada sesi aktif lain.
                    </div>
                  ) : (
                    sessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-lg bg-neutral-900 text-neutral-400">
                            {sess.deviceInfo.toLowerCase().includes('mobile') ? (
                              <Smartphone className="w-4 h-4" />
                            ) : (
                              <Laptop className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-200 truncate flex items-center gap-1.5">
                              <span>{sess.deviceInfo}</span>
                              {sess.isCurrent && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                                  PERANGKAT INI
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-500 mt-0.5">
                              IP: {sess.ipAddress} • Aktif:{' '}
                              {new Date(sess.lastActiveAt).toLocaleTimeString('id-ID')}
                            </div>
                          </div>
                        </div>

                        {!sess.isCurrent && (
                          <button
                            onClick={() => handleRevokeSession(sess.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-lg border border-red-900/60 transition cursor-pointer"
                          >
                            Cabut Akses
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: USER ACCESS REQUESTS (FOR PRIMARY OWNER REVIEW) */}
          {tab === 'USER_REQUESTS' && currentUser?.role === 'PRIMARY_OWNER' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/40 text-xs text-amber-200 leading-relaxed">
                <span className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                  <span>Otorisasi Akses Pengguna Baru</span>
                </span>
                Berikut adalah daftar pengguna yang mengajukan permohonan akses (Request Access). Kode verifikasi 6-digit di bawah ini dibuat oleh backend dan juga otomatis dikirimkan ke Master Gmail Anda. Berikan kode ini kepada user yang bersangkutan agar mereka dapat menyelesaikan aktivasi akun dan masuk ke <strong>User Workspace</strong> kosong milik mereka sendiri.
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Daftar Permintaan Menunggu Persetujuan ({pendingRequests.length})</span>
                  </h3>
                  <button
                    onClick={loadPendingRequests}
                    className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingRequests ? 'animate-spin' : ''}`} />
                    <span>Perbarui</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {pendingRequests.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-500 rounded-xl bg-neutral-950/60 border border-neutral-850 flex flex-col items-center gap-1.5">
                      <UserCheck className="w-6 h-6 text-neutral-600" />
                      <span>Tidak ada permintaan akses user yang sedang menunggu persetujuan.</span>
                    </div>
                  ) : (
                    pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-xl bg-neutral-950/90 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-neutral-200 flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="truncate">{req.email}</span>
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
                            <span>Diminta: {new Date(req.requestedAt).toLocaleTimeString('id-ID')}</span>
                            <span>•</span>
                            <span className="text-amber-400/90">
                              Berlaku s/d: {new Date(req.expiresAt).toLocaleTimeString('id-ID')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <div className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-amber-500/40 text-amber-300 font-mono font-bold tracking-widest text-sm flex items-center gap-2">
                            <span>{req.accessCode}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(req.accessCode);
                                setCopiedCodeId(req.id);
                                setTimeout(() => setCopiedCodeId(null), 2000);
                              }}
                              className="text-neutral-400 hover:text-white transition p-0.5 cursor-pointer"
                              title="Salin kode verifikasi"
                            >
                              {copiedCodeId === req.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRevokeRequest(req.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-lg border border-red-900/60 transition cursor-pointer"
                          >
                            Tolak
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-[11px] text-neutral-500">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Enkripsi scrypt + Anti brute-force multi-device</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold cursor-pointer transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
