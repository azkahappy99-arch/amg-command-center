/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Tv,
  Film,
  PlayCircle,
  Menu,
  Shield,
  Layers,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
} from 'lucide-react';
import { Sidebar, NavSection } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { ChannelsView } from './components/ChannelsView.tsx';
import { VideosView } from './components/VideosView.tsx';
import { ContentProfilesView } from './components/ContentProfilesView.tsx';
import { MasterTitlesView } from './components/MasterTitlesView.tsx';
import { MasterThumbnailsView } from './components/MasterThumbnailsView.tsx';
import { SchedulerView } from './components/SchedulerView.tsx';
import { AutomationView } from './components/AutomationView.tsx';
import { QueueView } from './components/QueueView.tsx';
import { ErrorCenterView } from './components/ErrorCenterView.tsx';
import { NotificationsView } from './components/NotificationsView.tsx';
import { ActivityLogsView } from './components/ActivityLogsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { RevenueAnalyticsView } from './components/RevenueAnalyticsView.tsx';
import {
  Channel,
  ContentProfile,
  MasterTitle,
  MasterThumbnail,
  ManagedVideo,
  NotificationItem,
  ActivityLog,
  AutomationBatch,
} from './types/index.ts';
import { api, sanitizeChannel } from './services/api.ts';
import {
  authorizeAndFetchYouTubeChannel,
  getStoredGisToken,
} from './services/youtubeGisAuth.ts';

export default function App() {
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');

  // Core Data States
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profiles, setProfiles] = useState<ContentProfile[]>([]);
  const [titles, setTitles] = useState<MasterTitle[]>([]);
  const [thumbnails, setThumbnails] = useState<MasterThumbnail[]>([]);
  const [videos, setVideos] = useState<ManagedVideo[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [recentBatches, setRecentBatches] = useState<AutomationBatch[]>([]);
  const [stats, setStats] = useState<{
    metrics: {
      totalChannels: number;
      connectedChannels: number;
      newVideos: number;
      hdReady: number;
      processing: number;
      scheduled: number;
      completedVideos: number;
      automationJobs: number;
      errors: number;
    };
    actionRequired: Array<{ id: string; type: 'warning' | 'error' | 'info'; title: string; description: string; link?: string }>;
  }>({
    metrics: {
      totalChannels: 0,
      connectedChannels: 0,
      newVideos: 0,
      hdReady: 0,
      processing: 0,
      scheduled: 0,
      completedVideos: 0,
      automationJobs: 0,
      errors: 0,
    },
    actionRequired: [],
  });

  const loadAllData = async (targetChanId?: string) => {
    setIsRefreshing(true);
    const activeId = targetChanId || selectedChannelId;
    try {
      const [
        statsData,
        channelsData,
        profilesData,
        titlesData,
        thumbsData,
        videosData,
        notifsData,
        logsData,
      ] = await Promise.all([
        api.getStats(activeId).catch(() => null),
        api.getChannels().catch(() => []),
        api.getContentProfiles().catch(() => []),
        api.getMasterTitles().catch(() => []),
        api.getMasterThumbnails().catch(() => []),
        api.getVideos().catch(() => []),
        api.getNotifications().catch(() => []),
        api.getActivityLogs().catch(() => []),
      ]);

      if (statsData) {
        setStats({ metrics: statsData.metrics, actionRequired: statsData.actionRequired });
        if (statsData.recentBatches) setRecentBatches(statsData.recentBatches);
      }
      if (channelsData) {
        const unlinkedRaw = localStorage.getItem('amg_unlinked_channel_ids');
        const unlinkedIds: string[] = unlinkedRaw ? JSON.parse(unlinkedRaw) : [];
        const isUnlinked = (id?: string) => (id ? unlinkedIds.includes(id) : false);

        const cleanChannels = channelsData
          .filter((c: Channel) => !isUnlinked(c.id) && !isUnlinked(c.youtubeChannelId) && !isUnlinked(`chan-${c.youtubeChannelId}`))
          .map(sanitizeChannel);

        setChannels(cleanChannels);
        if (cleanChannels.length > 0) {
          if (!selectedChannelId || !cleanChannels.some((c: Channel) => c.id === selectedChannelId)) {
            setSelectedChannelId(cleanChannels[0].id);
          }
        } else {
          setSelectedChannelId('');
        }
        localStorage.setItem('amg_channels', JSON.stringify(cleanChannels));

        // Cache connected channel IDs in localStorage for client resilience
        const connectedReal = cleanChannels.filter((c: Channel) => !c.isSeeded && (c.status === 'CONNECTED' || c.status === 'Connected'));
        try {
          localStorage.setItem('amg_permanent_channel_ids', JSON.stringify(connectedReal.map(c => c.youtubeChannelId)));
        } catch {
          // ignore
        }
      }
      if (profilesData) setProfiles(profilesData);
      if (titlesData) setTitles(titlesData);
      if (thumbsData) setThumbnails(thumbsData);
      if (videosData) setVideos(videosData);
      if (notifsData) setNotifications(notifsData);
      if (logsData) setActivityLogs(logsData);
    } catch (err) {
      console.error('Failed to load application state:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Immediate direct localStorage inspection upon mount (100% static, no backend needed)
    try {
      const unlinkedRaw = localStorage.getItem('amg_unlinked_channel_ids');
      const unlinkedIds: string[] = unlinkedRaw ? JSON.parse(unlinkedRaw) : [];
      const isUnlinked = (id?: string) => (id ? unlinkedIds.includes(id) : false);

      const storedConnectedRaw = localStorage.getItem('amg_youtube_connected_channel');
      const storedToken = localStorage.getItem('amg_youtube_access_token');
      const storedChannelsRaw = localStorage.getItem('amg_channels');

      if (storedChannelsRaw) {
        const parsed = JSON.parse(storedChannelsRaw);
        if (Array.isArray(parsed)) {
          // Purge fixture mock channels, unlinked channels, and sanitize legacy mock monetization/revenue
          const realChannels = parsed
            .filter(
              (c: Channel) =>
                !c.isSeeded &&
                !isUnlinked(c.id) &&
                !isUnlinked(c.youtubeChannelId) &&
                !isUnlinked(`chan-${c.youtubeChannelId}`) &&
                c.id !== 'chan-ayam-warna' &&
                c.id !== 'chan-suara-alam' &&
                c.id !== 'chan-murottal' &&
                c.id !== 'chan-kucing-gemoy' &&
                !c.title?.includes('[DEMO FIXTURE]') &&
                !c.title?.includes('Demo Fixture') &&
                !c.title?.toLowerCase().includes('fixture')
            )
            .map(sanitizeChannel);

          if (storedConnectedRaw) {
            const live = JSON.parse(storedConnectedRaw);
            if (live && live.id && !isUnlinked(live.id) && !isUnlinked(`chan-${live.id}`)) {
              const idx = realChannels.findIndex(
                (c: Channel) =>
                  c.youtubeChannelId === live.id || c.id === live.id || c.id === `chan-${live.id}`
              );
              if (idx >= 0) {
                realChannels[idx] = sanitizeChannel({
                  ...realChannels[idx],
                  status: 'CONNECTED',
                  title: live.title || realChannels[idx].title,
                  thumbnailUrl: live.thumbnailUrl || realChannels[idx].thumbnailUrl,
                });
              }
            }
          }
          // Always write back sanitized channels (wiping away any legacy mock revenue & fake YPP)
          localStorage.setItem('amg_channels', JSON.stringify(realChannels));
          setChannels(realChannels);
          if (realChannels.length > 0) {
            setSelectedChannelId(realChannels[0].id);
          } else {
            setSelectedChannelId('');
          }
          const connCount = realChannels.filter(
            (c: Channel) => c.status === 'CONNECTED' || c.status === 'Connected'
          ).length;
          setStats((prev) => ({
            ...prev,
            metrics: {
              ...prev.metrics,
              totalChannels: realChannels.length,
              connectedChannels: connCount > 0 ? connCount : (storedToken && realChannels.length > 0 ? 1 : 0),
            },
          }));
        }
      } else if (storedToken) {
        setStats((prev) => ({
          ...prev,
          metrics: {
            ...prev.metrics,
            connectedChannels: 0,
          },
        }));
      }
    } catch (e) {
      console.warn('Initial direct localStorage load:', e);
    }

    loadAllData();
  }, []);

  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (selectedChannelId) {
      loadAllData(selectedChannelId);
    }
  }, [selectedChannelId]);

  const handleSyncActiveChannel = async (channelIdToSync?: string) => {
    setIsRefreshing(true);
    const targetId = channelIdToSync || selectedChannelId || channels[0]?.id;
    try {
      const storedToken = localStorage.getItem('amg_youtube_access_token');
      if (storedToken && targetId) {
        const syncRes = await api.syncChannel(targetId);
        const count = syncRes.actualFetchedFromYouTube ?? syncRes.detectedTotal ?? 0;
        setToastMessage({
          text: `Sinkronisasi YouTube berhasil: ${count} video riil terdeteksi untuk "${syncRes.channelTitle}"!`,
          type: 'success',
        });
      } else if (!storedToken) {
        // Prompt user to connect via GIS if no token
        await handleGisAuthorize(targetId);
        return;
      }
      await loadAllData(targetId);
    } catch (err: any) {
      console.warn('Sync channel error:', err);
      setToastMessage({
        text: `Gagal menyinkronkan data YouTube: ${err.message || 'Periksa koneksi atau otorisasi token.'}`,
        type: 'warning',
      });
      await loadAllData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGisAuthorize = async (channelId?: string) => {
    setIsRefreshing(true);
    try {
      const result = await authorizeAndFetchYouTubeChannel(true);
      const res = await api.gisSyncChannel({
        channelId,
        accessToken: result.accessToken,
        channelData: result.channel,
      });
      if (res && res.channel?.id) {
        setSelectedChannelId(res.channel.id);
      }
      setToastMessage({
        text: `Akun YouTube "${result.channel.title}" berhasil dihubungkan dan tersimpan permanen!`,
        type: 'success',
      });
      await loadAllData();
    } catch (err: any) {
      const isPopupClosed =
        err?.isPopupClosed ||
        err?.type === 'popup_closed' ||
        (typeof err?.message === 'string' && (
          err.message.toLowerCase().includes('closed') ||
          err.message.toLowerCase().includes('dibatalkan') ||
          err.message.toLowerCase().includes('cancel')
        ));

      if (isPopupClosed) {
        console.warn('[GIS] Otorisasi Google ditutup atau dibatalkan oleh pengguna.');
        setToastMessage({
          text: 'Otorisasi Google dibatalkan (jendela login ditutup).',
          type: 'info',
        });
      } else {
        console.warn('GIS Authorization notice:', err?.message || err);
        setToastMessage({
          text: `Google Identity Services: ${err?.message || 'Gagal mengotorisasi akun Google.'}`,
          type: 'error',
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;
  const unmanagedCount = videos.filter((v) => !v.isManaged).length;
  const lowStockChannelsCount = channels.filter(
    (c) => c.scheduleAlertStatus === 'LOW_STOCK' || c.scheduleAlertStatus === 'CRITICAL'
  ).length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased selection:bg-red-900 selection:text-white overflow-x-hidden max-w-[100vw] w-full">
      {/* Sidebar Navigation */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={setCurrentSection}
        unmanagedCount={unmanagedCount}
        openErrorsCount={stats.metrics.errors}
        unreadNotifsCount={unreadNotifsCount}
        lowStockChannelsCount={lowStockChannelsCount}
        mobileOpen={mobileOpen}
        onToggleMobile={() => setMobileOpen(!mobileOpen)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-72 transition-all w-full max-w-[100vw] overflow-x-hidden">
        {/* Top Header */}
        <Header
          onToggleMobile={() => setMobileOpen(true)}
          channels={channels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={setSelectedChannelId}
          onRefresh={loadAllData}
          onSyncChannel={handleSyncActiveChannel}
          isRefreshing={isRefreshing}
          unreadCount={unreadNotifsCount}
          onOpenNotifications={() => setCurrentSection('notifications')}
        />

        {/* Dynamic Route View */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-10 overflow-x-hidden">
          {currentSection === 'dashboard' && (
            <DashboardView
              metrics={stats.metrics}
              actionRequired={stats.actionRequired}
              recentBatches={recentBatches}
              recentActivity={activityLogs}
              channels={channels}
              profiles={profiles}
              titles={titles}
              thumbnails={thumbnails}
              videos={videos}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
              onNavigate={setCurrentSection}
              onSyncAll={loadAllData}
              onSyncChannel={handleSyncActiveChannel}
              isSyncing={isRefreshing}
              onGisAuthorize={handleGisAuthorize}
            />
          )}

          {currentSection === 'revenue' && (
            <RevenueAnalyticsView channels={channels} />
          )}

          {currentSection === 'channels' && (
            <ChannelsView
              channels={channels}
              profiles={profiles}
              onChannelUpdated={loadAllData}
              onNavigateToAutomation={(chanId) => {
                setSelectedChannelId(chanId);
                setCurrentSection('automation');
              }}
              onNavigateToTitles={(chanId) => {
                setSelectedChannelId(chanId);
                setCurrentSection('titles');
              }}
              onNavigateToThumbnails={(chanId) => {
                setSelectedChannelId(chanId);
                setCurrentSection('thumbnails');
              }}
            />
          )}

          {currentSection === 'videos' && (
            <VideosView
              videos={videos}
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
              onRefresh={loadAllData}
              onSyncChannel={handleSyncActiveChannel}
              isRefreshing={isRefreshing}
            />
          )}

          {currentSection === 'profiles' && (
            <ContentProfilesView
              profiles={profiles}
              channels={channels}
              onProfilesUpdated={loadAllData}
              onNavigateToTitles={(targetId) => {
                if (targetId) setSelectedChannelId(targetId);
                setCurrentSection('titles');
              }}
              onNavigateToThumbnails={(targetId) => {
                if (targetId) setSelectedChannelId(targetId);
                setCurrentSection('thumbnails');
              }}
            />
          )}

          {currentSection === 'titles' && (
            <MasterTitlesView
              titles={titles}
              profiles={profiles}
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
              onTitlesUpdated={loadAllData}
            />
          )}

          {currentSection === 'thumbnails' && (
            <MasterThumbnailsView
              thumbnails={thumbnails}
              titles={titles}
              profiles={profiles}
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
              onThumbnailsUpdated={loadAllData}
            />
          )}

          {currentSection === 'scheduler' && (
            <SchedulerView
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
            />
          )}

          {currentSection === 'automation' && (
            <AutomationView
              channels={channels}
              profiles={profiles}
              initialChannelId={selectedChannelId}
              onAutomationTriggered={loadAllData}
              onNavigateToQueue={() => setCurrentSection('queue')}
            />
          )}

          {currentSection === 'queue' && <QueueView />}

          {currentSection === 'errors' && <ErrorCenterView />}

          {currentSection === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              channels={channels}
              onNotificationsUpdated={loadAllData}
            />
          )}

          {currentSection === 'activity' && (
            <ActivityLogsView logs={activityLogs} onRefresh={loadAllData} />
          )}

          {currentSection === 'settings' && <SettingsView />}
        </main>

        {/* Global Footer */}
        {currentSection !== 'dashboard' && (
          <footer className="mt-auto py-6 px-4 border-t border-neutral-900/80 bg-neutral-950 text-center pb-24 lg:pb-8">
            <p className="text-xs text-zinc-400 font-medium tracking-wide">
              Copyright © 2026 Azka Media Group. All Rights Reserved.
            </p>
          </footer>
        )}

        {/* Mobile Quick Bottom Navigation Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 flex items-center justify-around px-2 lg:hidden">
          <button
            onClick={() => setCurrentSection('dashboard')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] ${
              currentSection === 'dashboard' ? 'text-red-500 font-bold' : 'text-neutral-400'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 mb-0.5" />
            <span>Dasbor</span>
          </button>

          <button
            onClick={() => setCurrentSection('channels')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] relative ${
              currentSection === 'channels' ? 'text-red-500 font-bold' : 'text-neutral-400'
            }`}
          >
            <Tv className="w-4 h-4 mb-0.5" />
            <span>Channel</span>
            {lowStockChannelsCount > 0 && (
              <span className="absolute top-1 right-3 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
            )}
          </button>

          <button
            onClick={() => setCurrentSection('videos')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] relative ${
              currentSection === 'videos' ? 'text-red-500 font-bold' : 'text-neutral-400'
            }`}
          >
            <Film className="w-4 h-4 mb-0.5" />
            <span>Video</span>
            {unmanagedCount > 0 && (
              <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-amber-400"></span>
            )}
          </button>

          <button
            onClick={() => setCurrentSection('automation')}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] ${
              currentSection === 'automation' ? 'text-red-500 font-bold' : 'text-neutral-400'
            }`}
          >
            <PlayCircle className="w-4 h-4 mb-0.5" />
            <span>Otomasi</span>
          </button>

          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-[10px] text-neutral-400 hover:text-white relative"
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span>Lainnya</span>
            {unreadNotifsCount > 0 && (
              <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>
        </div>
      </div>

      {/* In-App Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 max-w-sm sm:max-w-md animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`p-3.5 rounded-xl border shadow-xl flex items-start gap-3 backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/40'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-950/40'
                : toastMessage.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200 shadow-amber-950/40'
                : 'bg-neutral-900/90 border-neutral-700 text-neutral-200 shadow-black/50'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />}
            <div className="flex-1 text-xs leading-relaxed font-medium">
              {toastMessage.text}
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-neutral-400 hover:text-white p-0.5 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
