import React from 'react';
import { Menu, RefreshCw, Bell, Shield, Radio, CheckCircle, AlertCircle } from 'lucide-react';
import { Channel } from '../types/index.ts';

interface HeaderProps {
  onToggleMobile: () => void;
  channels: Channel[];
  selectedChannelId: string;
  onSelectChannel: (channelId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  unreadCount: number;
  onOpenNotifications: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobile,
  channels,
  selectedChannelId,
  onSelectChannel,
  onRefresh,
  isRefreshing,
  unreadCount,
  onOpenNotifications,
}) => {
  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 w-full max-w-full px-3 sm:px-4 md:px-6 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800 box-border overflow-hidden">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
        {/* Mobile menu toggle */}
        <button
          onClick={onToggleMobile}
          className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 lg:hidden shrink-0 cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Channel Selector */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0 flex-1 max-w-[200px] xs:max-w-[240px] sm:max-w-[320px] md:max-w-md">
          <span className="hidden sm:inline-block text-xs font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            Channel:
          </span>
          <select
            value={selectedChannelId}
            onChange={(e) => onSelectChannel(e.target.value)}
            className="w-full min-w-0 bg-neutral-900 border border-neutral-800 text-neutral-100 text-xs font-semibold rounded-lg px-2 sm:px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 hover:border-neutral-700 cursor-pointer truncate"
          >
            {channels.map((chan) => (
              <option key={chan.id} value={chan.id} className="bg-neutral-900 text-white">
                {chan.title} ({chan.status})
              </option>
            ))}
          </select>
        </div>

        {activeChannel && (
          <div className="hidden md:flex items-center space-x-2 pl-2 border-l border-neutral-800 text-[11px] shrink-0">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {activeChannel.timezone}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-900 text-neutral-300 border border-neutral-800">
              Jadwal: {activeChannel.publishTime}
            </span>
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0 ml-2">
        {/* Sync / Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 text-xs font-medium transition cursor-pointer"
          title="Sinkronkan status channel dan basis data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-500' : ''}`} />
          <span className="hidden sm:inline">Sinkronkan</span>
        </button>

        {/* Notifications */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition cursor-pointer"
          aria-label="Lihat notifikasi"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          )}
        </button>

        {/* User avatar / Organization pill */}
        <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-neutral-800">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-red-600 to-amber-600 flex items-center justify-center text-white text-xs font-bold shadow">
            A
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-xs font-medium text-neutral-200">Azka Maulana</div>
            <div className="text-[10px] text-neutral-500">Super Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
};
