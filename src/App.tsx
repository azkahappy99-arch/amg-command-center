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
import { api } from './services/api.ts';
import {
  authorizeAndFetchYouTubeChannel,
  getStoredGisToken,
} from './services/youtubeGisAuth.ts';

export default function App() {
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('chan-ayam-warna');

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

  const loadAllData = async () => {
    setIsRefreshing(true);
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
        api.getStats().catch(() => null),
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
        setChannels(channelsData);
        if (channelsData.length > 0 && !channelsData.some((c: Channel) => c.id === selectedChannelId)) {
          setSelectedChannelId(channelsData[0].id);
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
    loadAllData();
  }, []);

  const handleGisAuthorize = async (channelId?: string) => {
  setIsRefreshing(true);
  try {
    const result = await authorizeAndFetchYouTubeChannel(true);
    if (result && result.channel) {
      setChannels([
        {
          id: result.channel.id,
          title: result.channel.title,
          youtubeChannelId: result.channel.id,
          status: 'CONNECTED',
          thumbnailUrl: result.channel.thumbnailUrl,
          subscriberCount: result.channel.subscriberCount,
          videoCount: result.channel.videoCount,
        } as any
      ]);
      setSelectedChannelId(result.channel.id);
    }
  } catch (err: any) {
    console.error('GIS Authorization error:', err);
    alert(`Google Identity Services: ${err.message || 'Otorisasi ditolak atau popup dibatalkan.'}`);
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
              onNavigate={setCurrentSection}
              onSyncAll={loadAllData}
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
            />
          )}

          {currentSection === 'videos' && (
            <VideosView
              videos={videos}
              channels={channels}
              onRefresh={loadAllData}
              isRefreshing={isRefreshing}
            />
          )}

          {currentSection === 'profiles' && (
            <ContentProfilesView
              profiles={profiles}
              channels={channels}
              onProfilesUpdated={loadAllData}
              onNavigateToTitles={() => setCurrentSection('titles')}
              onNavigateToThumbnails={() => setCurrentSection('thumbnails')}
            />
          )}

          {currentSection === 'titles' && (
            <MasterTitlesView
              titles={titles}
              profiles={profiles}
              onTitlesUpdated={loadAllData}
            />
          )}

          {currentSection === 'thumbnails' && (
            <MasterThumbnailsView
              thumbnails={thumbnails}
              titles={titles}
              profiles={profiles}
              onThumbnailsUpdated={loadAllData}
            />
          )}

          {currentSection === 'scheduler' && (
            <SchedulerView channels={channels} />
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
    </div>
  );
}
