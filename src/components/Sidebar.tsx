import React from 'react';
import {
  LayoutDashboard,
  Tv,
  Film,
  Layers,
  Type,
  Image as ImageIcon,
  CalendarClock,
  PlayCircle,
  ListOrdered,
  AlertTriangle,
  Bell,
  History,
  Settings,
  ChevronRight,
  ShieldCheck,
  Menu,
  X,
  DollarSign,
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'revenue'
  | 'channels'
  | 'videos'
  | 'profiles'
  | 'titles'
  | 'thumbnails'
  | 'scheduler'
  | 'automation'
  | 'queue'
  | 'errors'
  | 'notifications'
  | 'activity'
  | 'settings';

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  unmanagedCount: number;
  openErrorsCount: number;
  unreadNotifsCount: number;
  lowStockChannelsCount?: number;
  mobileOpen: boolean;
  onToggleMobile: () => void;
}

export const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'unmanaged' | 'errors' | 'notifs';
}> = [
  { id: 'dashboard', label: 'Dasbor', icon: LayoutDashboard },
  { id: 'revenue', label: 'Monetisasi & Pendapatan', icon: DollarSign },
  { id: 'channels', label: 'Channel', icon: Tv },
  { id: 'videos', label: 'Video', icon: Film, badgeKey: 'unmanaged' },
  { id: 'profiles', label: 'Profil Konten', icon: Layers },
  { id: 'titles', label: 'Master Judul', icon: Type },
  { id: 'thumbnails', label: 'Master Thumbnail', icon: ImageIcon },
  { id: 'scheduler', label: 'Penyelarasan Jadwal', icon: CalendarClock },
  { id: 'automation', label: 'Mulai Otomasi', icon: PlayCircle },
  { id: 'queue', label: 'Antrean', icon: ListOrdered },
  { id: 'errors', label: 'Kendala', icon: AlertTriangle, badgeKey: 'errors' },
  { id: 'notifications', label: 'Notifikasi', icon: Bell, badgeKey: 'notifs' },
  { id: 'activity', label: 'Riwayat Aktivitas', icon: History },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  unmanagedCount,
  openErrorsCount,
  unreadNotifsCount,
  lowStockChannelsCount = 0,
  mobileOpen,
  onToggleMobile,
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onToggleMobile}
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-72 bg-neutral-950 border-r border-neutral-800 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-neutral-800/80 bg-neutral-950/60">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white font-black tracking-wider shadow-lg shadow-red-900/30">
              AMG
            </div>
            <div>
              <div className="font-bold text-sm text-neutral-100 tracking-wide flex items-center gap-1.5">
                AZKA MEDIA GROUP
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <div className="text-[11px] font-medium text-neutral-400">Pusat Otomasi YouTube</div>
            </div>
          </div>
          <button
            onClick={onToggleMobile}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 lg:hidden"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 px-3 py-4 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
          <div className="px-3 pb-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
            Menu Operasional
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            let badge = null;

            if (item.id === 'channels' && lowStockChannelsCount > 0) {
              badge = (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1.5 shadow-[0_0_8px_#ef4444]">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
                  <span>{lowStockChannelsCount} stok tipis</span>
                </span>
              );
            } else if (item.badgeKey === 'unmanaged' && unmanagedCount > 0) {
              badge = (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {unmanagedCount} baru
                </span>
              );
            } else if (item.badgeKey === 'errors' && openErrorsCount > 0) {
              badge = (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {openErrorsCount}
                </span>
              );
            } else if (item.badgeKey === 'notifs' && unreadNotifsCount > 0) {
              badge = (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  {unreadNotifsCount}
                </span>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectSection(item.id);
                  if (mobileOpen) onToggleMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-neutral-800 text-white font-semibold shadow-inner border border-neutral-700/60'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/80'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-red-500' : 'text-neutral-500 group-hover:text-neutral-300'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {badge}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Security & System Info Footer */}
        <div className="p-3 m-3 rounded-xl bg-neutral-900/80 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1.5">
          <div className="flex items-center justify-between text-neutral-300 font-semibold text-xs">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Keamanan API Server
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
              Aktif
            </span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-neutral-400">
            Token kredensial terisolasi aman di sisi server.
          </p>
        </div>
      </aside>
    </>
  );
};
