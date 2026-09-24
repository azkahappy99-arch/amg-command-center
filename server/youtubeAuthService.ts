/**
 * YouTube OAuth & Authentication Service (Server-side)
 * Manages Google OAuth 2.0 authorization code flow, secure token exchanges,
 * and token refreshes. Never leaks refresh tokens or client secrets to the browser.
 */

export interface StoredCredentials {
  channelId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number; // Unix timestamp ms
  scope: string;
  accountEmail?: string;
}

// In-memory secure server-side credential vault
const credentialsVault: Map<string, StoredCredentials> = new Map();

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
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL 
      ? `${process.env.APP_URL}/api/auth/youtube/callback`
      : 'http://localhost:3000/api/auth/youtube/callback');
  }

  public getRedirectUri(custom?: string): string {
    if (custom) return custom;
    return this.redirectUri;
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
    if (!this.clientId || !this.clientSecret) {
      return {
        success: false,
        error: 'OAuth client credentials missing (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET).',
      };
    }

    const targetRedirect = this.getRedirectUri(customRedirectUri);

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: targetRedirect,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
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
   */
  public async refreshAccessToken(channelId: string): Promise<string | null> {
    const creds = credentialsVault.get(channelId);
    if (!creds || !creds.refreshToken) {
      return null;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: creds.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        console.error('Failed to refresh token for channel', channelId);
        return null;
      }

      const tokenData = await response.json();
      creds.accessToken = tokenData.access_token;
      creds.tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
      credentialsVault.set(channelId, creds);

      return creds.accessToken;
    } catch (err) {
      console.error('Error refreshing access token:', err);
      return null;
    }
  }

  /**
   * Stores credentials securely on server.
   */
  public storeCredentials(channelId: string, creds: StoredCredentials): void {
    credentialsVault.set(channelId, creds);
  }

  /**
   * Retrieves active access token for a channel, refreshing if expired.
   */
  public async getValidAccessToken(channelId: string): Promise<string | null> {
    const creds = credentialsVault.get(channelId);
    if (!creds) return null;

    // Refresh if expiring in less than 5 minutes
    if (Date.now() > creds.tokenExpiresAt - 300000) {
      if (creds.refreshToken) {
        return await this.refreshAccessToken(channelId);
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
    const creds = credentialsVault.get(channelId);
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
  }
}

export const youtubeAuthService = new YoutubeAuthService();
