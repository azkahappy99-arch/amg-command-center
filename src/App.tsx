/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { AuthModal, UserSessionData } from './components/AuthModal.tsx';
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
import { api, sanitizeChannel, isRealChannel, isRealVideo, isRealThumbnail, isRealTitle } from './services/api.ts';
import { initialChannels, initialVideos } from './services/initialSeedData.ts';
import {
  authorizeAndFetchYouTubeChannel,
  fetchChannelVideosFromYouTube,
  getStoredGisToken,
} from './services/youtubeGisAuth.ts';

// Offline-First & Anti-Overwrite Helpers
function getStoredActiveChannelId(): string {
  try {
    const activeStored = localStorage.getItem('amg_active_channel_id') || localStorage.getItem('amg_active_channel');
    if (activeStored) return activeStored;
    const storedChannelsRaw = localStorage.getItem('amg_channels');
    if (storedChannelsRaw) {
      const parsed = JSON.parse(storedChannelsRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].id || parsed[0].youtubeChannelId || '';
      }
    }
  } catch {}
  return '';
}

function getStoredChannels(): Channel[] {
  try {
    const unlinkedRaw = localStorage.getItem('amg_unlinked_channel_ids');
    const unlinkedIds: string[] = unlinkedRaw ? JSON.parse(unlinkedRaw) : [];
    const isUnlinked = (id?: string) => (id ? unlinkedIds.includes(id) : false);

    const storedChannelsRaw = localStorage.getItem('amg_channels');
    if (storedChannelsRaw) {
      const parsed = JSON.parse(storedChannelsRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = parsed
          .filter(
            (c: Channel) =>
              isRealChannel(c) &&
              !isUnlinked(c.id) &&
              !isUnlinked(c.youtubeChannelId) &&
              !isUnlinked(`chan-${c.youtubeChannelId}`)
          )
          .map(sanitizeChannel);
        return clean;
      }
    }
  } catch (e) {
    console.warn('getStoredChannels error:', e);
  }
  return [];
}

function getStoredVideos(activeChanId?: string): ManagedVideo[] {
  try {
    const active = activeChanId || getStoredActiveChannelId();
    if (active) {
      const cleanId = active.replace(/^chan-/, '');
      const raw1 = localStorage.getItem(`amg_real_videos_${active}`);
      const raw2 = localStorage.getItem(`amg_real_videos_${cleanId}`);
      const raw3 = localStorage.getItem(`amg_real_videos_chan-${cleanId}`);
      const raw = raw1 || raw2 || raw3;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const clean = parsed.filter(isRealVideo);
          if (clean.length > 0) return clean;
        }
      }
    }
    const rawAll = localStorage.getItem('amg_videos');
    if (rawAll) {
      const parsed = JSON.parse(rawAll);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = parsed.filter(isRealVideo);
        if (clean.length > 0) return clean;
      }
    }
  } catch (e) {
    console.warn('getStoredVideos error:', e);
  }
  return [];
}

export default function App() {
  const [currentSection, setCurrentSection] = useState<NavSection>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(() => getStoredActiveChannelId());

  // Authentication & Ownership State
  const [currentUser, setCurrentUser] = useState<UserSessionData | null>(null);
  const [isOwnerProvisioned, setIsOwnerProvisioned] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const isAutoFetchingRef = useRef(false);

  // Core Data States - Initialized offline-first directly from localStorage
  const [channels, setChannels] = useState<Channel[]>(() => getStoredChannels());
  const [profiles, setProfiles] = useState<ContentProfile[]>([]);
  const [titles, setTitles] = useState<MasterTitle[]>([]);
  const [thumbnails, setThumbnails] = useState<MasterThumbnail[]>([]);
  const [videos, setVideos] = useState<ManagedVideo[]>(() => getStoredVideos());
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
  }>(() => {
    const initialChans = getStoredChannels();
    const initialVids = getStoredVideos();
    const connCount = initialChans.filter((c) => c.status === 'CONNECTED' || c.status === 'Connected').length;
    return {
      metrics: {
        totalChannels: initialChans.length,
        connectedChannels: connCount,
        newVideos: initialChans.length === 0 ? 0 : initialVids.length,
        hdReady: initialChans.length === 0 ? 0 : initialVids.filter((v) => v.definition === 'hd').length,
        processing: initialChans.length === 0 ? 0 : initialVids.filter((v) => v.managementStatus === 'PROCESSING').length,
        scheduled: initialChans.length === 0 ? 0 : initialVids.filter((v) => v.managementStatus === 'SCHEDULED').length,
        completedVideos: initialChans.length === 0 ? 0 : initialVids.filter((v) => v.managementStatus === 'COMPLETED').length,
        automationJobs: 0,
        errors: 0,
      },
      actionRequired: [],
    };
  });

  const handleSelectChannel = (chanId: string) => {
    setSelectedChannelId(chanId);
    if (chanId) {
      localStorage.setItem('amg_active_channel_id', chanId);
      localStorage.setItem('amg_active_channel', chanId);
      const cleanId = chanId.replace(/^chan-/, '');
      const raw =
        localStorage.getItem(`amg_real_videos_${chanId}`) ||
        localStorage.getItem(`amg_real_videos_${cleanId}`) ||
        localStorage.getItem(`amg_real_videos_chan-${cleanId}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const clean = parsed.filter(isRealVideo);
            if (clean.length > 0) setVideos(clean);
          }
        } catch {}
      }
    }
  };

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

      let cleanChannels: Channel[] = [];
      if (channelsData && Array.isArray(channelsData) && channelsData.length > 0) {
        const unlinkedRaw = localStorage.getItem('amg_unlinked_channel_ids');
        const unlinkedIds: string[] = unlinkedRaw ? JSON.parse(unlinkedRaw) : [];
        const isUnlinked = (id?: string) => (id ? unlinkedIds.includes(id) : false);

        cleanChannels = channelsData
          .filter((c: Channel) => !isUnlinked(c.id) && !isUnlinked(c.youtubeChannelId) && !isUnlinked(`chan-${c.youtubeChannelId}`))
          .map(sanitizeChannel);

        if (cleanChannels.length > 0) {
          setChannels(cleanChannels);
          localStorage.setItem('amg_channels', JSON.stringify(cleanChannels));
          if (!selectedChannelId || !cleanChannels.some((c: Channel) => c.id === selectedChannelId)) {
            const nextActive = cleanChannels[0].id;
            setSelectedChannelId(nextActive);
            localStorage.setItem('amg_active_channel_id', nextActive);
            localStorage.setItem('amg_active_channel', nextActive);
          }

          // Cache connected channel IDs in localStorage for client resilience
          const connectedReal = cleanChannels.filter((c: Channel) => !c.isSeeded && (c.status === 'CONNECTED' || c.status === 'Connected'));
          try {
            localStorage.setItem('amg_permanent_channel_ids', JSON.stringify(connectedReal.map(c => c.youtubeChannelId)));
          } catch {
            // ignore
          }
        }
      } else {
        // ANTI-OVERWRITE: Backend returned empty [] or error.
        // DO NOT overwrite localStorage! Preserve existing valid channels in state and localStorage.
        const localChans = getStoredChannels();
        if (localChans.length > 0) {
          cleanChannels = localChans;
          setChannels((prev) => (prev.length > 0 ? prev : localChans));
          if (!selectedChannelId) {
            const nextActive = getStoredActiveChannelId() || localChans[0].id;
            setSelectedChannelId(nextActive);
          }
        }
      }

      if (statsData) {
        setStats((prev) => {
          const currentChans = cleanChannels.length > 0 ? cleanChannels : getStoredChannels();
          const currentVids = currentChans.length === 0 ? [] : getStoredVideos(targetChanId || selectedChannelId);
          return {
            metrics: {
              ...statsData.metrics,
              totalChannels: currentChans.length === 0 ? 0 : (statsData.metrics.totalChannels > 0 ? statsData.metrics.totalChannels : currentChans.length),
              connectedChannels:
                currentChans.length === 0
                  ? 0
                  : (statsData.metrics.connectedChannels > 0
                      ? statsData.metrics.connectedChannels
                      : currentChans.filter((c) => c.status === 'CONNECTED' || c.status === 'Connected').length),
              newVideos: currentChans.length === 0 ? 0 : Math.max(statsData.metrics.newVideos, currentVids.length),
              hdReady: currentChans.length === 0 ? 0 : statsData.metrics.hdReady,
              scheduled: currentChans.length === 0 ? 0 : statsData.metrics.scheduled,
              completedVideos: currentChans.length === 0 ? 0 : statsData.metrics.completedVideos,
              automationJobs: currentChans.length === 0 ? 0 : statsData.metrics.automationJobs,
            },
            actionRequired: statsData.actionRequired || prev.actionRequired,
          };
        });
        if (statsData.recentBatches && statsData.recentBatches.length > 0) {
          setRecentBatches(statsData.recentBatches);
        }
      }

      if (profilesData) setProfiles(profilesData);
      if (titlesData) {
        let cleanTitles = titlesData.filter(isRealTitle);
        const targetChan = targetChanId || selectedChannelId || cleanChannels?.[0]?.id;
        if (targetChan) {
          const cleanId = targetChan.replace(/^chan-/, '');
          const raw1 = localStorage.getItem(`amg_master_titles_${targetChan}`);
          const raw2 = localStorage.getItem(`amg_master_titles_${cleanId}`);
          const raw3 = localStorage.getItem(`amg_master_titles_chan-${cleanId}`);
          const combined: MasterTitle[] = [
            ...(raw1 ? JSON.parse(raw1) : []),
            ...(raw2 ? JSON.parse(raw2) : []),
            ...(raw3 ? JSON.parse(raw3) : []),
          ].filter(isRealTitle);
          for (const lt of combined) {
            if (!cleanTitles.some((t) => t.id === lt.id || (t.text === lt.text && t.channelId === lt.channelId))) {
              cleanTitles.push(lt);
            }
          }
        }
        setTitles(cleanTitles);
      }
      if (thumbsData) {
        let cleanThumbs = thumbsData.filter(isRealThumbnail);
        const targetChan = targetChanId || selectedChannelId || cleanChannels?.[0]?.id;
        if (targetChan) {
          const cleanId = targetChan.replace(/^chan-/, '');
          const raw1 = localStorage.getItem(`amg_master_thumbnails_${targetChan}`);
          const raw2 = localStorage.getItem(`amg_master_thumbnails_${cleanId}`);
          const raw3 = localStorage.getItem(`amg_master_thumbnails_chan-${cleanId}`);
          const combined = [
            ...(raw1 ? JSON.parse(raw1) : []),
            ...(raw2 ? JSON.parse(raw2) : []),
            ...(raw3 ? JSON.parse(raw3) : []),
          ].filter(isRealThumbnail);
          for (const lt of combined) {
            if (!cleanThumbs.some((t) => t.id === lt.id)) {
              cleanThumbs.push(lt);
            }
          }
        }
        setThumbnails(cleanThumbs);
      }
      if (videosData && Array.isArray(videosData) && videosData.length > 0) {
        let cleanVids = videosData.filter(isRealVideo);
        if (cleanVids.length > 0) {
          // Safe background merge based on unique video ID
          setVideos((prevVideos) => {
            const existing = prevVideos && prevVideos.length > 0 ? prevVideos : getStoredVideos(targetChanId || selectedChannelId);
            const videoMap = new Map<string, ManagedVideo>();
            for (const ev of existing) {
              const id = ev.youtubeVideoId || ev.id;
              if (id) videoMap.set(id, ev);
            }
            for (const nv of cleanVids) {
              const id = nv.youtubeVideoId || nv.id;
              if (id) {
                const prev = videoMap.get(id);
                videoMap.set(id, prev ? { ...prev, ...nv } : nv);
              }
            }
            const merged = Array.from(videoMap.values());
            localStorage.setItem('amg_videos', JSON.stringify(merged));
            const targetChan = targetChanId || selectedChannelId || cleanChannels?.[0]?.id;
            if (targetChan) {
              const cleanChanId = targetChan.replace(/^chan-/, '');
              const chanVids = merged.filter((v) =>
                v.channelId === targetChan ||
                v.channelId === `chan-${targetChan}` ||
                v.channelId === cleanChanId ||
                v.channelId === `chan-${cleanChanId}`
              );
              if (chanVids.length > 0) {
                localStorage.setItem(`amg_real_videos_${targetChan}`, JSON.stringify(chanVids));
                localStorage.setItem(`amg_real_videos_${cleanChanId}`, JSON.stringify(chanVids));
                localStorage.setItem(`amg_real_videos_chan-${cleanChanId}`, JSON.stringify(chanVids));
              }
            }
            return merged;
          });
        }
      } else {
        // ANTI-OVERWRITE: Backend returned empty [] or error!
        // DO NOT overwrite localStorage with empty []!
        const targetChan = targetChanId || selectedChannelId || cleanChannels?.[0]?.id;
        const localExisting = getStoredVideos(targetChan);
        if (localExisting.length > 0) {
          setVideos((curr) => (curr.length > 0 ? curr : localExisting));
        }

        // Auto-Fetch Real YouTube Data saat Channel Terkoneksi (Tanpa Klik Manual)
        const hasActiveChannels = (cleanChannels && cleanChannels.length > 0) || getStoredChannels().length > 0;
        const activeChan = targetChanId || selectedChannelId || cleanChannels?.[0]?.id;
        if (hasActiveChannels && !isAutoFetchingRef.current) {
          const storedToken = getStoredGisToken() || localStorage.getItem('amg_youtube_access_token');
          if (storedToken && activeChan) {
            isAutoFetchingRef.current = true;
            fetchChannelVideosFromYouTube(storedToken, activeChan)
              .then((vids) => {
                if (Array.isArray(vids) && vids.length > 0) {
                  const real = vids.filter(isRealVideo);
                  setVideos((prevVideos) => {
                    const videoMap = new Map<string, ManagedVideo>();
                    for (const ev of prevVideos) {
                      const id = ev.youtubeVideoId || ev.id;
                      if (id) videoMap.set(id, ev);
                    }
                    for (const nv of real) {
                      const id = nv.youtubeVideoId || nv.id;
                      if (id) {
                        const prev = videoMap.get(id);
                        videoMap.set(id, prev ? { ...prev, ...nv } : nv);
                      }
                    }
                    const merged = Array.from(videoMap.values());
                    localStorage.setItem('amg_videos', JSON.stringify(merged));
                    return merged;
                  });
                  setToastMessage({
                    text: `Auto-Fetch Berhasil: ${real.length} video riil YouTube berhasil disinkronkan!`,
                    type: 'success',
                  });
                }
              })
              .catch((err) => {
                console.warn('[Auto-Fetch Background Sync]', err);
              })
              .finally(() => {
                isAutoFetchingRef.current = false;
              });
          }
        }
      }

      if (notifsData) setNotifications(notifsData);
      if (logsData) setActivityLogs(logsData);
    } catch (err) {
      console.error('Failed to load application state:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Immediate direct localStorage inspection upon mount (100% static, zero wait)
    try {
      const storedConnectedRaw = localStorage.getItem('amg_youtube_connected_channel');
      const realChannels = getStoredChannels();

      if (storedConnectedRaw && realChannels.length > 0) {
        const live = JSON.parse(storedConnectedRaw);
        if (live && live.id) {
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
              blockId: 'block-general',
              contentProfileId: 'block-general',
              nicheCategory: 'General',
            });
            localStorage.setItem('amg_channels', JSON.stringify(realChannels));
            setChannels(realChannels);
          }
        }
      }

      const initialActive = getStoredActiveChannelId();
      if (initialActive) {
        setSelectedChannelId(initialActive);
      } else if (realChannels.length > 0) {
        const firstId = realChannels[0].id;
        setSelectedChannelId(firstId);
        localStorage.setItem('amg_active_channel_id', firstId);
        localStorage.setItem('amg_active_channel', firstId);
      }

      const initialVids = getStoredVideos(initialActive);
      if (initialVids.length > 0) {
        setVideos(initialVids);
      }
    } catch (e) {
      console.warn('Initial direct localStorage load:', e);
    }

    loadAllData();

    // Check Auth Status & Ownership Provisioning
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('amg_auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/auth/status', { headers });
        if (res.ok) {
          const data = await res.json();
          setIsOwnerProvisioned(data.isOwnerProvisioned);
          if (data.currentUser) {
            setCurrentUser(data.currentUser);
            if (data.currentUser.role === 'USER') {
              // Clear cached channels for user to prevent owner data leaking
              localStorage.removeItem('amg_channels');
            }
          }
          if (!data.isOwnerProvisioned) {
            setIsAuthModalOpen(true);
          }
        }
      } catch {
        // ignore
      }
    };
    checkAuthStatus();
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
          onSelectChannel={handleSelectChannel}
          onRefresh={loadAllData}
          onSyncChannel={handleSyncActiveChannel}
          isRefreshing={isRefreshing}
          unreadCount={unreadNotifsCount}
          onOpenNotifications={() => setCurrentSection('notifications')}
          currentUser={currentUser}
          isOwnerProvisioned={isOwnerProvisioned}
          onOpenAuth={() => setIsAuthModalOpen(true)}
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
              onSelectChannel={handleSelectChannel}
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
              videos={videos}
              onChannelUpdated={loadAllData}
              onNavigateToAutomation={(chanId) => {
                handleSelectChannel(chanId);
                setCurrentSection('automation');
              }}
              onNavigateToTitles={(chanId) => {
                if (chanId) handleSelectChannel(chanId);
                setCurrentSection('titles');
              }}
              onNavigateToThumbnails={(chanId) => {
                if (chanId) handleSelectChannel(chanId);
                setCurrentSection('thumbnails');
              }}
            />
          )}

          {currentSection === 'videos' && (
            <VideosView
              videos={videos}
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={handleSelectChannel}
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
              onNavigateToTitles={(chanId) => {
                if (chanId) setSelectedChannelId(chanId);
                setCurrentSection('titles');
              }}
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
      {/* AMG Security, Ownership & Session Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        isOwnerProvisioned={isOwnerProvisioned}
        onAuthSuccess={(_token, user) => {
          setCurrentUser(user);
          setIsOwnerProvisioned(true);
          if (user.role === 'USER') {
            localStorage.removeItem('amg_channels');
            localStorage.removeItem('amg_videos');
            localStorage.removeItem('amg_profiles');
            localStorage.removeItem('amg_master_titles');
            localStorage.removeItem('amg_master_thumbnails');
            setChannels([]);
            setSelectedChannelId('');
          }
          loadAllData();
        }}
        onLogout={() => {
          localStorage.removeItem('amg_auth_token');
          localStorage.removeItem('amg_channels');
          localStorage.removeItem('amg_videos');
          localStorage.removeItem('amg_profiles');
          localStorage.removeItem('amg_master_titles');
          localStorage.removeItem('amg_master_thumbnails');
          setCurrentUser(null);
          loadAllData();
        }}
      />
    </div>
  );
}
