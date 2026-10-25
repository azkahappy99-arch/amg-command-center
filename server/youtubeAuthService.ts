/**
 * YouTube OAuth & Authentication Service (Server-side)
 * Manages Google OAuth 2.0 authorization code flow, secure token exchanges,
 * and token refreshes. Never leaks refresh tokens or client secrets to the browser.
 */

import fs from 'fs';
import path from 'path';
import { dbStore } from './db.js';

export interface StoredCredentials {
  channelId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number; // Unix timestamp ms
  scope: string;
  accountEmail?: string;
}

// Persistent server-side credential vault
const credentialsVault: Map<string, StoredCredentials> = new Map();
const credentialsFilePath = path.resolve(process.cwd(), 'data/amg-credentials.json');

function loadCredentialsFromDisk() {
  try {
    if (fs.existsSync(credentialsFilePath)) {
      const raw = fs.readFileSync(credentialsFilePath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const [id, cred] of data) {
          credentialsVault.set(id, cred);
        }
      }
      console.log(`[YoutubeAuthService] Loaded credentials for ${credentialsVault.size} channels from disk.`);
    }
  } catch (err) {
    console.error('[YoutubeAuthService] Error reading credentials from disk:', err);
  }
}

function saveCredentialsToDisk() {
  try {
    const dataDir = path.dirname(credentialsFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const entries = Array.from(credentialsVault.entries());
    const tempFile = `${credentialsFilePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(tempFile, credentialsFilePath);
  } catch (err) {
    console.error('[YoutubeAuthService] Error saving credentials to disk:', err);
  }
}

// Initialize on startup
loadCredentialsFromDisk();

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export class YoutubeAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '140483783524-8gqs0lc2p401mopm32hvrk1ej7kkqtof.apps.googleusercontent.com';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL 
      ? `${process.env.APP_URL}/api/auth/youtube/callback`
      : 'http://localhost:3000/api/auth/youtube/callback');
    loadCredentialsFromDisk();
  }

  public getRedirectUri(custom?: string): string {
    if (custom) return custom;
    return this.redirectUri;
  }

  /**
   * Resolves credentials across all known aliases:
   * raw channelId, clean ID, chan- prefixed, or dbStore channel lookup.
   */
  public resolveStoredCredentials(channelId: string): StoredCredentials | undefined {
    if (!channelId) return undefined;
    let creds = credentialsVault.get(channelId);
    if (creds) return creds;

    const cleanId = channelId.startsWith('chan-') ? channelId.replace(/^chan-/, '') : channelId;
    creds = credentialsVault.get(cleanId) || credentialsVault.get(`chan-${cleanId}`);
    if (creds) return creds;

    // Check dbStore.channels
    try {
      const ch = dbStore.channels.get(channelId) || 
                 dbStore.getChannelByYoutubeId(channelId) || 
                 dbStore.getChannelByIdOrTitle(channelId);
      if (ch) {
        creds = credentialsVault.get(ch.id) ||
                (ch.youtubeChannelId ? credentialsVault.get(ch.youtubeChannelId) : undefined) ||
                (ch.youtubeChannelId ? credentialsVault.get(`chan-${ch.youtubeChannelId}`) : undefined);
        if (creds) return creds;
      }
    } catch {}

    // Check fuzzy match across vault
    const lower = channelId.toLowerCase();
    for (const [key, val] of credentialsVault.entries()) {
      if (key.toLowerCase() === lower || key.includes(cleanId) || cleanId.includes(key.replace(/^chan-/, ''))) {
        return val;
      }
    }

    return undefined;
  }

  /**
   * Generates Google OAuth 2.0 authorization URL.
   */
  public generateAuthUrl(channelId?: string, customRedirectUri?: string): { url: string; configured: boolean; error?: string } {
    if (!this.clientId) {
      return {
        url: '',
        configured: false,
        error: 'GOOGLE_CLIENT_ID is not configured in server environment. Set GOOGLE_CLIENT_ID or use manual token mapping.',
      };
    }

    const state = JSON.stringify({
      channelId: channelId || '',
      nonce: Math.random().toString(36).substring(2),
    });

    const targetRedirect = this.getRedirectUri(customRedirectUri);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: targetRedirect,
      response_type: 'code',
      scope: YOUTUBE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: Buffer.from(state).toString('base64'),
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      configured: true,
    };
  }

  /**
   * Exchanges authorization code for Access & Refresh tokens.
   */
  public async exchangeCode(code: string, customRedirectUri?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.clientId) {
      return {
        success: false,
        error: 'OAuth client credentials missing (GOOGLE_CLIENT_ID).',
      };
    }

    const targetRedirect = this.getRedirectUri(customRedirectUri);

    try {
      const bodyParams: Record<string, string> = {
        code,
        client_id: this.clientId,
        redirect_uri: targetRedirect,
        grant_type: 'authorization_code',
      };
      if (this.clientSecret) {
        bodyParams.client_secret = this.clientSecret;
      }

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(bodyParams),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error_description || errorData.error || 'Failed to exchange authorization code.',
        };
      }

      const tokenData = await response.json();
      return {
        success: true,
        data: tokenData,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error during token exchange',
      };
    }
  }

  /**
   * Refreshes access token using stored refresh token.
   * Can accept channelId or direct refreshToken string.
   */
  public async refreshAccessToken(channelId?: string, directRefreshToken?: string): Promise<string | null> {
    const creds = channelId ? this.resolveStoredCredentials(channelId) : undefined;
    const rToken = directRefreshToken || creds?.refreshToken;

    if (!rToken) {
      console.warn(`[YoutubeAuthService] No refresh token available to refresh access token for channel: ${channelId}`);
      return null;
    }

    try {
      const bodyParams: Record<string, string> = {
        client_id: this.clientId,
        refresh_token: rToken,
        grant_type: 'refresh_token',
      };
      if (this.clientSecret) {
        bodyParams.client_secret = this.clientSecret;
      }

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(bodyParams),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[YoutubeAuthService] Failed to refresh token for channel ${channelId}:`, errorData);
        return null;
      }

      const tokenData = await response.json();
      const newAccessToken = tokenData.access_token;
      const expiresInSec = tokenData.expires_in || 3600;
      const newExpiresAt = Date.now() + expiresInSec * 1000;

      const targetId = channelId || creds?.channelId || 'global-youtube';
      const consolidated: StoredCredentials = {
        channelId: targetId,
        accessToken: newAccessToken,
        refreshToken: tokenData.refresh_token || rToken, // Always preserve refresh_token
        tokenExpiresAt: newExpiresAt,
        scope: tokenData.scope || creds?.scope || 'https://www.googleapis.com/auth/youtube.force-ssl',
        accountEmail: creds?.accountEmail,
      };

      this.storeCredentials(targetId, consolidated);

      console.log(`[YoutubeAuthService] Successfully refreshed access token for channel "${channelId}" (expires in ${expiresInSec}s)`);
      return newAccessToken;
    } catch (err) {
      console.error('[YoutubeAuthService] Error refreshing access token:', err);
      return null;
    }
  }

  /**
   * Stores credentials securely on server.
   * CRITICAL: Never overwrites an existing valid refreshToken with undefined.
   */
  public storeCredentials(channelId: string, creds: StoredCredentials): void {
    if (!channelId || !creds) return;
    const existing = this.resolveStoredCredentials(channelId);

    // CRITICAL: Preserve existing refreshToken if incoming does not supply one!
    const effectiveRefreshToken = (creds.refreshToken && creds.refreshToken.trim() !== '')
      ? creds.refreshToken
      : existing?.refreshToken;

    const consolidated: StoredCredentials = {
      channelId: creds.channelId || channelId,
      accessToken: creds.accessToken,
      refreshToken: effectiveRefreshToken,
      tokenExpiresAt: creds.tokenExpiresAt || (Date.now() + 3600 * 1000),
      scope: creds.scope || existing?.scope || 'https://www.googleapis.com/auth/youtube.force-ssl',
      accountEmail: creds.accountEmail || existing?.accountEmail,
    };

    credentialsVault.set(channelId, consolidated);
    const cleanId = channelId.startsWith('chan-') ? channelId.replace(/^chan-/, '') : channelId;
    credentialsVault.set(cleanId, consolidated);
    credentialsVault.set(`chan-${cleanId}`, consolidated);

    // Map to dbStore channel record if exists
    try {
      const ch = dbStore.channels.get(channelId) || dbStore.getChannelByYoutubeId(channelId);
      if (ch) {
        credentialsVault.set(ch.id, consolidated);
        if (ch.youtubeChannelId) {
          credentialsVault.set(ch.youtubeChannelId, consolidated);
          credentialsVault.set(`chan-${ch.youtubeChannelId}`, consolidated);
        }
      }
    } catch {}

    saveCredentialsToDisk();
  }

  /**
   * Retrieves active access token for a channel, auto-refreshing proactively if expired or expiring soon (< 5m).
   */
  public async getValidAccessToken(channelId: string): Promise<string | null> {
    if (!channelId) return null;
    const creds = this.resolveStoredCredentials(channelId);
    if (!creds) return null;

    // Proactive refresh: if token expires in less than 5 minutes (300,000 ms) or is already expired
    if (Date.now() > creds.tokenExpiresAt - 300000) {
      if (creds.refreshToken) {
        console.log(`[YoutubeAuthService] Access token for channel "${channelId}" is expiring soon or expired. Auto-refreshing proactively...`);
        const refreshed = await this.refreshAccessToken(channelId);
        if (refreshed) {
          return refreshed;
        }
      }
    }

    return creds.accessToken;
  }

  /**
   * Returns safe connection status for a channel (NO tokens).
   */
  public getConnectionStatus(channelId: string): {
    status: 'CONNECTED' | 'DISCONNECTED' | 'AUTHORIZATION REQUIRED' | 'TOKEN EXPIRED' | 'ERROR';
    isConnected: boolean;
    hasRefreshToken: boolean;
    accountEmail?: string;
    expiresAt?: string;
  } {
    const creds = this.resolveStoredCredentials(channelId);
    if (!creds || (!creds.accessToken && !creds.refreshToken)) {
      return { status: 'AUTHORIZATION REQUIRED', isConnected: false, hasRefreshToken: false };
    }
    const isExpired = Date.now() > creds.tokenExpiresAt;
    if (isExpired && !creds.refreshToken) {
      return {
        status: 'TOKEN EXPIRED',
        isConnected: false,
        hasRefreshToken: false,
        accountEmail: creds.accountEmail,
        expiresAt: new Date(creds.tokenExpiresAt).toISOString(),
      };
    }
    return {
      status: 'CONNECTED',
      isConnected: true,
      hasRefreshToken: !!creds.refreshToken,
      accountEmail: creds.accountEmail,
      expiresAt: new Date(creds.tokenExpiresAt).toISOString(),
    };
  }

  public revokeCredentials(channelId: string): void {
    credentialsVault.delete(channelId);
    const cleanId = channelId.startsWith('chan-') ? channelId.replace(/^chan-/, '') : channelId;
    credentialsVault.delete(cleanId);
    credentialsVault.delete(`chan-${cleanId}`);
    saveCredentialsToDisk();
  }
}

export const youtubeAuthService = new YoutubeAuthService();
