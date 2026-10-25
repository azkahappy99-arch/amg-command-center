import { youtubeAuthService } from '../server/youtubeAuthService.js';
import { authService } from '../server/authService.js';
import { dbStore } from '../server/db.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ PASSED: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('AMG OAUTH & SESSION AUTO-REFRESH TEST SUITE');
  console.log('====================================================');

  // TEST 1: YoutubeAuthService preserves existing refreshToken if incoming is undefined
  const testChannelId = 'chan-test-refresh-001';
  youtubeAuthService.storeCredentials(testChannelId, {
    channelId: testChannelId,
    accessToken: 'old_access_token_123',
    refreshToken: 'valid_secret_refresh_token_xyz',
    tokenExpiresAt: Date.now() + 3600000,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
  });

  let stored = youtubeAuthService.resolveStoredCredentials(testChannelId);
  assert(stored?.refreshToken === 'valid_secret_refresh_token_xyz', 'Refresh token stored initially');

  // Now simulate an update that only provides a new access_token without refresh_token
  youtubeAuthService.storeCredentials(testChannelId, {
    channelId: testChannelId,
    accessToken: 'new_access_token_456',
    tokenExpiresAt: Date.now() + 3600000,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
  });

  stored = youtubeAuthService.resolveStoredCredentials(testChannelId);
  assert(stored?.accessToken === 'new_access_token_456', 'Access token updated');
  assert(stored?.refreshToken === 'valid_secret_refresh_token_xyz', 'CRITICAL: Refresh token preserved despite incoming undefined');

  // TEST 2: Alias resolution across clean and chan- prefixed IDs
  const cleanId = 'test-refresh-001';
  const resolvedClean = youtubeAuthService.resolveStoredCredentials(cleanId);
  assert(resolvedClean?.accessToken === 'new_access_token_456', 'Resolved credentials using clean ID alias');

  const resolvedPrefixed = youtubeAuthService.resolveStoredCredentials(`chan-${cleanId}`);
  assert(resolvedPrefixed?.accessToken === 'new_access_token_456', 'Resolved credentials using chan- prefixed ID alias');

  // TEST 3: Connection status detection
  const connStatus = youtubeAuthService.getConnectionStatus(testChannelId);
  assert(connStatus.isConnected === true, 'Channel connection status is CONNECTED');
  assert(connStatus.hasRefreshToken === true, 'Channel connection status shows hasRefreshToken = true');

  // TEST 4: Sliding session expiration in authService
  const testSessionId = `test-sess-${Date.now()}`;
  const now = Date.now();
  dbStore.sessions.set(testSessionId, {
    id: testSessionId,
    userId: 'usr-owner-primary',
    email: 'owner@test.com',
    role: 'PRIMARY_OWNER',
    workspaceId: 'ws-owner-primary',
    deviceInfo: 'Test Device',
    ipAddress: '127.0.0.1',
    createdAt: new Date(now - 100000).toISOString(),
    expiresAt: new Date(now + 1000000).toISOString(),
    lastActiveAt: new Date(now - 100000).toISOString(),
    isRevoked: false,
  });

  const validated = authService.validateSession(testSessionId);
  assert(validated !== null, 'Session validates successfully');
  const updatedSession = dbStore.sessions.get(testSessionId);
  const updatedExpiresAtMs = new Date(updatedSession!.expiresAt).getTime();
  assert(updatedExpiresAtMs > now + 6 * 24 * 60 * 60 * 1000, 'Session expiration successfully slid forward by 7 days on active usage');

  // TEST 5: Grace period reactivation for expired sessions
  const expiredSessionId = `test-sess-exp-${Date.now()}`;
  // Expired 10 minutes ago (within 2 hour grace window)
  dbStore.sessions.set(expiredSessionId, {
    id: expiredSessionId,
    userId: 'usr-owner-primary',
    email: 'owner@test.com',
    role: 'PRIMARY_OWNER',
    workspaceId: 'ws-owner-primary',
    deviceInfo: 'Test Device',
    ipAddress: '127.0.0.1',
    createdAt: new Date(now - 3600000).toISOString(),
    expiresAt: new Date(now - 600000).toISOString(),
    lastActiveAt: new Date(now - 600000).toISOString(),
    isRevoked: false,
  });

  const graceValidated = authService.validateSession(expiredSessionId);
  assert(graceValidated !== null, 'Session within grace window is reactivated instead of dropped');
  const renewedSession = dbStore.sessions.get(expiredSessionId);
  assert(renewedSession?.isRevoked === false, 'Session is not revoked');
  assert(new Date(renewedSession!.expiresAt).getTime() > now, 'Session expiration extended beyond current time');

  // Cleanup
  youtubeAuthService.revokeCredentials(testChannelId);
  dbStore.sessions.delete(testSessionId);
  dbStore.sessions.delete(expiredSessionId);

  console.log('====================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runTests();
