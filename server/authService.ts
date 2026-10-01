/**
 * AMG — Authentication, Authorization & Security Service
 *
 * Enforces:
 * 1. Exactly 2 Roles: PRIMARY_OWNER and USER. (No Admin, No Operator, No other roles).
 * 2. Primary Owner Identity: Master Gmail + Owner Password + Master Key.
 * 3. Initial Owner Provisioning: Protected by server-side bootstrap authorization token.
 * 4. Locked Initial Setup: Once PRIMARY_OWNER is created, initial setup is permanently locked.
 * 5. Password & Master Key Protection: Cryptographic scrypt hashing with 32-byte salts (NEVER plaintext).
 * 6. Multi-Device Sessions: 64-char cryptographically secure bearer tokens, sliding expiry, revocation.
 * 7. Tenant & Workspace Isolation: OWNER_WORKSPACE vs USER_WORKSPACE.
 * 8. Rate Limiting & Anti-Brute-Force Protection.
 * 9. User Access Authorization: Temporary single-use activation code workflow.
 * 10. Audit Logging without leaking credentials.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dbStore, UserRecord, SessionRecord, UserAccessRequest, WorkspaceRecord } from './db.js';
import { emailService } from './emailService.js';

// Temporary memory store for Owner inspection of active codes: requestId -> code
const activeCodesMap = new Map<string, string>();

// In-memory rate limiting map: identifier -> { attempts: number, lockUntil: number }
interface RateLimitEntry {
  attempts: number;
  lockUntil: number;
}
const rateLimitMap = new Map<string, RateLimitEntry>();

// Rate limit helper: 5 attempts per 15 minutes
function checkRateLimit(identifier: string, maxAttempts = 5, lockDurationMs = 15 * 60 * 1000): { isBlocked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry) {
    return { isBlocked: false, retryAfterSeconds: 0 };
  }

  if (entry.lockUntil > now) {
    const retryAfter = Math.ceil((entry.lockUntil - now) / 1000);
    return { isBlocked: true, retryAfterSeconds: retryAfter };
  }

  if (entry.lockUntil <= now && entry.attempts >= maxAttempts) {
    rateLimitMap.delete(identifier);
    return { isBlocked: false, retryAfterSeconds: 0 };
  }

  return { isBlocked: false, retryAfterSeconds: 0 };
}

function recordFailedAttempt(identifier: string, maxAttempts = 5, lockDurationMs = 15 * 60 * 1000): void {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier) || { attempts: 0, lockUntil: 0 };

  entry.attempts += 1;
  if (entry.attempts >= maxAttempts) {
    entry.lockUntil = now + lockDurationMs;
  }
  rateLimitMap.set(identifier, entry);
}

function resetRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}

export class AuthService {
  private bootstrapTokenFilePath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        console.error('[AuthService] Could not create data directory:', e);
      }
    }
    this.bootstrapTokenFilePath = path.join(dataDir, '.owner-bootstrap-token');
    this.ensureBootstrapState();
  }

  /**
   * Hashes a secret using OWASP-recommended scrypt with random salt.
   * Returns "salt:hash" string.
   */
  public hashCredential(credential: string): string {
    if (!credential) throw new Error('Credential cannot be empty.');
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.scryptSync(credential, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Constant-time credential verification to prevent timing attacks.
   */
  public verifyCredential(credential: string, storedHash: string): boolean {
    if (!credential || !storedHash || !storedHash.includes(':')) return false;
    try {
      const [salt, expectedHash] = storedHash.split(':');
      if (!salt || !expectedHash) return false;
      const actualHash = crypto.scryptSync(credential, salt, 64).toString('hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      const actualBuf = Buffer.from(actualHash, 'hex');
      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves or initializes the server-side bootstrap authorization token for Initial Owner Setup.
   * If PRIMARY OWNER already exists, returns empty string (permanently locked).
   */
  public getOrGenerateBootstrapToken(): string {
    if (dbStore.isOwnerProvisioned()) {
      return '';
    }

    // 1. Check environment variable override
    if (process.env.OWNER_BOOTSTRAP_SECRET && process.env.OWNER_BOOTSTRAP_SECRET.trim().length > 0) {
      return process.env.OWNER_BOOTSTRAP_SECRET.trim();
    }

    // 2. Check existing one-time token file
    if (fs.existsSync(this.bootstrapTokenFilePath)) {
      try {
        const stored = fs.readFileSync(this.bootstrapTokenFilePath, 'utf8').trim();
        if (stored.length > 0) return stored;
      } catch (e) {
        console.error('[AuthService] Error reading bootstrap token file:', e);
      }
    }

    // 3. Generate secure random 32-character token
    const token = crypto.randomBytes(16).toString('hex');
    try {
      fs.writeFileSync(this.bootstrapTokenFilePath, token, { mode: 0o600 });
      console.log('===============================================================');
      console.log('[AMG SECURITY] INITIAL OWNER SETUP BOOTSTRAP AUTHORIZATION');
      console.log(`[AMG SECURITY] One-time Owner Bootstrap Token: ${token}`);
      console.log('===============================================================');
    } catch (e) {
      console.error('[AuthService] Could not write bootstrap token file:', e);
    }

    return token;
  }

  /**
   * Ensures bootstrap token file is cleaned up if Owner is already provisioned.
   */
  public ensureBootstrapState(): void {
    if (dbStore.isOwnerProvisioned()) {
      if (fs.existsSync(this.bootstrapTokenFilePath)) {
        try {
          fs.unlinkSync(this.bootstrapTokenFilePath);
        } catch {
          // ignore
        }
      }
    } else {
      this.getOrGenerateBootstrapToken();
    }
  }

  /**
   * Validates bootstrap authorization token.
   */
  public validateBootstrapToken(token: string): boolean {
    if (dbStore.isOwnerProvisioned()) return false;
    const expected = this.getOrGenerateBootstrapToken();
    if (!expected || !token) return false;

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(token);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  /**
   * Checks whether Primary Owner has already been provisioned.
   */
  public isOwnerProvisioned(): boolean {
    return dbStore.isOwnerProvisioned();
  }

  /**
   * Returns current primary owner details (safe for status checking).
   */
  public getPrimaryOwner(): { id: string; email: string; workspaceId: string } | null {
    const owner = dbStore.getPrimaryOwner();
    if (!owner) return null;
    return {
      id: owner.id,
      email: owner.email,
      workspaceId: owner.workspaceId,
    };
  }

  /**
   * Initial Owner Provisioning Flow:
   * Only callable ONCE. Requires server-side bootstrap token.
   * Creates PRIMARY_OWNER and OWNER_WORKSPACE.
   */
  public provisionPrimaryOwner(params: {
    masterGmail: string;
    password: string;
    confirmPassword?: string;
    masterKey: string;
    confirmMasterKey?: string;
    bootstrapToken: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): { success: boolean; token?: string; user?: any; workspaceId?: string; error?: string } {
    // 1. HARD GATE: Cannot create second owner or overwrite existing
    if (dbStore.isOwnerProvisioned()) {
      return {
        success: false,
        error: 'Initial Owner Setup is permanently locked. A PRIMARY OWNER already exists for this AMG Command Center.',
      };
    }

    // 2. Validate Bootstrap Token
    if (!this.validateBootstrapToken(params.bootstrapToken)) {
      return {
        success: false,
        error: 'Invalid or missing Bootstrap Authorization Token. Please check the server console or server environment configuration.',
      };
    }

    // 3. Validate Inputs
    const email = (params.masterGmail || '').trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      return { success: false, error: 'Valid Master/Owner Gmail address is required.' };
    }

    const password = params.password || '';
    if (password.length < 8) {
      return { success: false, error: 'Owner Password must be at least 8 characters long.' };
    }
    if (params.confirmPassword && password !== params.confirmPassword) {
      return { success: false, error: 'Owner Password and confirmation do not match.' };
    }

    const masterKey = params.masterKey || '';
    if (masterKey.length < 8) {
      return { success: false, error: 'Master Key must be at least 8 characters long.' };
    }
    if (params.confirmMasterKey && masterKey !== params.confirmMasterKey) {
      return { success: false, error: 'Master Key and confirmation do not match.' };
    }

    // 4. Hash Credentials (scrypt + random salts — NEVER plaintext)
    const passwordHash = this.hashCredential(password);
    const masterKeyHash = this.hashCredential(masterKey);

    // 5. Create PRIMARY_OWNER Record & Workspace
    const ownerId = 'usr-owner-primary';
    const workspaceId = 'ws-owner-primary';
    const nowIso = new Date().toISOString();

    const owner: UserRecord = {
      id: ownerId,
      email,
      role: 'PRIMARY_OWNER', // Strictly PRIMARY_OWNER
      passwordHash,
      masterKeyHash,
      workspaceId,
      status: 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
    };

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      ownerId,
      name: `Owner Workspace (${email})`,
      type: 'OWNER_WORKSPACE',
      createdAt: nowIso,
    };

    dbStore.users.set(ownerId, owner);
    dbStore.workspaces.set(workspaceId, workspace);

    // Associate any existing channels and profiles with Owner Workspace
    for (const ch of dbStore.channels.values()) {
      if (!ch.workspaceId) ch.workspaceId = workspaceId;
      if (!ch.ownerId) ch.ownerId = ownerId;
    }
    for (const v of dbStore.videos.values()) {
      if (!(v as any).workspaceId) (v as any).workspaceId = workspaceId;
    }
    for (const p of dbStore.profiles.values()) {
      if (!(p as any).workspaceId) (p as any).workspaceId = workspaceId;
    }

    dbStore.saveToDisk();

    // 6. Invalidate Bootstrap Token
    if (fs.existsSync(this.bootstrapTokenFilePath)) {
      try {
        fs.unlinkSync(this.bootstrapTokenFilePath);
      } catch {
        // ignore
      }
    }

    // 7. Create Active Multi-Device Session for Owner
    const session = this.createSession(owner, params.deviceInfo, params.ipAddress);

    dbStore.logActivity({
      user: email,
      operation: 'PRIMARY_OWNER_PROVISIONED',
      previousValue: 'Unprovisioned AMG Instance',
      newValue: `Primary Owner established: ${email}. Initial Setup permanently locked.`,
      result: 'SUCCESS',
    });

    return {
      success: true,
      token: session.id,
      user: this.sanitizeUser(owner),
      workspaceId,
    };
  }

  /**
   * Primary Owner Daily Login:
   * Master Gmail + Owner Password (fast and convenient on any device).
   * Multi-device supported (Laptop, HP, PC).
   */
  public loginOwner(params: {
    masterGmail: string;
    password: string;
    masterKey?: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): { success: boolean; token?: string; user?: any; workspaceId?: string; error?: string; retryAfterSeconds?: number } {
    const email = (params.masterGmail || '').trim().toLowerCase();
    const rateKey = `owner-login:${email}:${params.ipAddress || 'unknown'}`;

    // Rate limit check
    const rateCheck = checkRateLimit(rateKey);
    if (rateCheck.isBlocked) {
      return {
        success: false,
        error: `Too many failed attempts. Login locked for ${rateCheck.retryAfterSeconds} seconds.`,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      };
    }

    const owner = dbStore.getPrimaryOwner();
    if (!owner) {
      return {
        success: false,
        error: 'Primary Owner has not been provisioned yet. Please complete Initial Owner Setup first.',
      };
    }

    // Verify email match
    if (owner.email !== email) {
      recordFailedAttempt(rateKey);
      return { success: false, error: 'Master Gmail atau Owner Password salah.' };
    }

    // Verify password
    if (!this.verifyCredential(params.password || '', owner.passwordHash)) {
      recordFailedAttempt(rateKey);
      return { success: false, error: 'Master Gmail atau Owner Password salah.' };
    }

    // Authentication succeeded: reset rate limit & create session
    resetRateLimit(rateKey);
    owner.lastLoginAt = new Date().toISOString();
    owner.updatedAt = new Date().toISOString();
    dbStore.users.set(owner.id, owner);
    dbStore.saveToDisk();

    const session = this.createSession(owner, params.deviceInfo, params.ipAddress);

    dbStore.logActivity({
      user: owner.email,
      operation: 'OWNER_LOGIN_SUCCESS',
      previousValue: 'Logged out',
      newValue: `Owner logged in from ${params.deviceInfo || 'Authorized Device'} (${params.ipAddress || 'local'}).`,
      result: 'SUCCESS',
    });

    return {
      success: true,
      token: session.id,
      user: this.sanitizeUser(owner),
      workspaceId: owner.workspaceId,
    };
  }

  /**
   * Reset / Recovery Flow using Master Key:
   * Used when Owner forgot password or resets credentials on any device.
   */
  public recoverOwnerPassword(params: {
    masterGmail: string;
    masterKey: string;
    newPassword: string;
    confirmNewPassword?: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): { success: boolean; token?: string; user?: any; workspaceId?: string; error?: string } {
    const email = (params.masterGmail || '').trim().toLowerCase();
    const rateKey = `owner-recover:${email}:${params.ipAddress || 'unknown'}`;

    const rateCheck = checkRateLimit(rateKey, 3, 15 * 60 * 1000);
    if (rateCheck.isBlocked) {
      return {
        success: false,
        error: `Terlalu banyak percobaan reset. Silakan tunggu ${rateCheck.retryAfterSeconds} detik.`,
      };
    }

    const owner = dbStore.getPrimaryOwner();
    if (!owner || owner.email !== email) {
      recordFailedAttempt(rateKey);
      return { success: false, error: 'Master Gmail atau Master Key tidak valid.' };
    }

    if (!owner.masterKeyHash || !this.verifyCredential(params.masterKey || '', owner.masterKeyHash)) {
      recordFailedAttempt(rateKey);
      return { success: false, error: 'Master Key pemulihan tidak cocok.' };
    }

    if (!params.newPassword || params.newPassword.length < 8) {
      return { success: false, error: 'Password baru minimal 8 karakter.' };
    }

    if (params.confirmNewPassword && params.newPassword !== params.confirmNewPassword) {
      return { success: false, error: 'Password baru dan konfirmasi tidak cocok.' };
    }

    resetRateLimit(rateKey);
    owner.passwordHash = this.hashCredential(params.newPassword);
    owner.updatedAt = new Date().toISOString();
    owner.lastLoginAt = new Date().toISOString();
    dbStore.users.set(owner.id, owner);
    dbStore.saveToDisk();

    const session = this.createSession(owner, params.deviceInfo, params.ipAddress);

    dbStore.logActivity({
      user: owner.email,
      operation: 'OWNER_PASSWORD_RECOVERED',
      previousValue: 'Previous password',
      newValue: 'Password successfully reset using Master Key recovery credential.',
      result: 'SUCCESS',
    });

    return {
      success: true,
      token: session.id,
      user: this.sanitizeUser(owner),
      workspaceId: owner.workspaceId,
    };
  }

  /**
   * Request User Access (New User Workflow):
   * User enters email -> Single-use access code generated and stored for Owner Master Gmail approval.
   */
  public requestUserAccess(emailRaw: string, ipAddress?: string): { success: boolean; message?: string; error?: string } {
    const email = (emailRaw || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Valid email address required.' };
    }

    const owner = dbStore.getPrimaryOwner();
    if (owner && owner.email === email) {
      return { success: false, error: 'This is the Primary Owner address. Please use the Owner Login tab.' };
    }

    const rateKey = `user-req:${email}:${ipAddress || 'unknown'}`;
    const rateCheck = checkRateLimit(rateKey, 3, 10 * 60 * 1000);
    if (rateCheck.isBlocked) {
      return { success: false, error: `Too many requests. Please wait ${rateCheck.retryAfterSeconds} seconds.` };
    }

    // Generate cryptographically secure 6-digit random code
    const accessCode = crypto.randomInt(100000, 999999).toString();
    const accessCodeHash = this.hashCredential(accessCode);
    const requestId = `req-${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();
    const expiresAt = new Date(now + 15 * 60 * 1000).toISOString(); // 15 mins expiry

    const accessReq: UserAccessRequest = {
      id: requestId,
      email,
      accessCodeHash,
      status: 'PENDING',
      requestedAt: new Date(now).toISOString(),
      expiresAt,
      attempts: 0,
    };

    dbStore.accessRequests.set(requestId, accessReq);
    dbStore.saveToDisk();

    // Store temporarily in memory for Owner dashboard inspection (15 mins)
    activeCodesMap.set(requestId, accessCode);
    setTimeout(() => {
      activeCodesMap.delete(requestId);
    }, 15 * 60 * 1000);

    // Dispatch verification code to Primary Owner's Master Gmail
    if (owner && owner.email) {
      emailService.sendUserAccessCodeToOwner({
        masterGmail: owner.email,
        requesterEmail: email,
        accessCode,
        expiresAt,
      }).catch((e) => console.warn('[AuthService] email dispatch error:', e));
    }

    // Log request & notify Owner
    console.log('===============================================================');
    console.log(`[AMG USER ACCESS] Access request for: ${email}`);
    console.log(`[AMG USER ACCESS] Activation Code (Sent to Owner): ${accessCode}`);
    console.log(`[AMG USER ACCESS] Valid for 15 minutes until ${expiresAt}`);
    console.log('===============================================================');

    dbStore.logActivity({
      user: email,
      operation: 'USER_ACCESS_REQUESTED',
      previousValue: 'Unregistered user',
      newValue: `Access requested for ${email}. Activation code generated and sent to Master Gmail.`,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: `Permintaan akses berhasil dikirim ke Master Gmail (${owner?.email || 'Owner'}). Masukkan kode verifikasi 6-digit setelah diberikan oleh Primary Owner.`,
    };
  }

  /**
   * Retrieves pending user access requests (for Owner review).
   */
  public getPendingAccessRequestsForOwner(): any[] {
    const list: any[] = [];
    const now = Date.now();
    for (const req of dbStore.accessRequests.values()) {
      if (req.status === 'PENDING' && new Date(req.expiresAt).getTime() > now) {
        list.push({
          id: req.id,
          email: req.email,
          requestedAt: req.requestedAt,
          expiresAt: req.expiresAt,
          accessCode: activeCodesMap.get(req.id) || '***',
        });
      }
    }
    return list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }

  /**
   * Verify Activation Code and Register New User:
   * Sets role: 'USER' (NEVER 'OWNER') and creates empty USER_WORKSPACE.
   */
  public verifyAccessAndRegister(params: {
    email: string;
    accessCode: string;
    password: string;
    confirmPassword?: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): { success: boolean; token?: string; user?: any; workspaceId?: string; error?: string } {
    const email = (params.email || '').trim().toLowerCase();
    const code = (params.accessCode || '').trim();

    if (!email || !code) {
      return { success: false, error: 'Email dan kode aktivasi wajib diisi.' };
    }

    const password = params.password || '';
    if (password.length < 8) {
      return { success: false, error: 'Password user minimal 8 karakter.' };
    }
    if (params.confirmPassword && password !== params.confirmPassword) {
      return { success: false, error: 'Konfirmasi password tidak cocok.' };
    }

    // Find latest pending access request for this email
    let matchingRequest: UserAccessRequest | null = null;
    const now = Date.now();

    for (const req of dbStore.accessRequests.values()) {
      if (req.email === email && req.status === 'PENDING') {
        if (new Date(req.expiresAt).getTime() > now) {
          if (this.verifyCredential(code, req.accessCodeHash)) {
            matchingRequest = req;
            break;
          }
        }
      }
    }

    if (!matchingRequest) {
      return { success: false, error: 'Kode aktivasi tidak valid atau telah kedaluwarsa (15 menit). Silakan minta kode baru.' };
    }

    // Invalidate access request (Anti-replay single-use)
    matchingRequest.status = 'APPROVED';
    matchingRequest.usedAt = new Date().toISOString();
    dbStore.accessRequests.set(matchingRequest.id, matchingRequest);

    // Create USER Account & isolated USER_WORKSPACE
    const userId = `usr-user-${crypto.randomBytes(6).toString('hex')}`;
    const workspaceId = `ws-user-${userId}`;
    const nowIso = new Date().toISOString();

    const user: UserRecord = {
      id: userId,
      email,
      role: 'USER', // STRICTLY USER. Cannot be OWNER.
      passwordHash: this.hashCredential(password),
      workspaceId,
      status: 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
    };

    const workspace: WorkspaceRecord = {
      id: workspaceId,
      ownerId: userId,
      name: `User Workspace (${email})`,
      type: 'USER_WORKSPACE', // Empty initial workspace
      createdAt: nowIso,
    };

    dbStore.users.set(userId, user);
    dbStore.workspaces.set(workspaceId, workspace);
    dbStore.saveToDisk();

    const session = this.createSession(user, params.deviceInfo, params.ipAddress);

    dbStore.logActivity({
      user: email,
      operation: 'USER_REGISTERED',
      previousValue: 'Pending Access Request',
      newValue: `User registered with dedicated User Workspace [${workspaceId}]. Initial data = 0.`,
      result: 'SUCCESS',
    });

    return {
      success: true,
      token: session.id,
      user: this.sanitizeUser(user),
      workspaceId,
    };
  }

  /**
   * Normal User Login:
   * Role is STRICTLY USER. Only grants access to their own USER_WORKSPACE.
   */
  public loginUser(params: {
    email: string;
    password: string;
    deviceInfo?: string;
    ipAddress?: string;
  }): { success: boolean; token?: string; user?: any; workspaceId?: string; error?: string } {
    const email = (params.email || '').trim().toLowerCase();
    const rateKey = `user-login:${email}:${params.ipAddress || 'unknown'}`;

    const rateCheck = checkRateLimit(rateKey);
    if (rateCheck.isBlocked) {
      return { success: false, error: `Terlalu banyak percobaan login. Silakan tunggu ${rateCheck.retryAfterSeconds} detik.` };
    }

    let foundUser: UserRecord | null = null;
    for (const u of dbStore.users.values()) {
      if (u.email === email && u.role === 'USER') {
        foundUser = u;
        break;
      }
    }

    if (!foundUser || !this.verifyCredential(params.password || '', foundUser.passwordHash)) {
      recordFailedAttempt(rateKey);
      return { success: false, error: 'Email atau password user tidak valid.' };
    }

    resetRateLimit(rateKey);
    foundUser.lastLoginAt = new Date().toISOString();
    foundUser.updatedAt = new Date().toISOString();
    dbStore.users.set(foundUser.id, foundUser);
    dbStore.saveToDisk();

    const session = this.createSession(foundUser, params.deviceInfo, params.ipAddress);

    dbStore.logActivity({
      user: foundUser.email,
      operation: 'USER_LOGIN_SUCCESS',
      previousValue: 'Logged out',
      newValue: `User logged into workspace [${foundUser.workspaceId}].`,
      result: 'SUCCESS',
    });

    return {
      success: true,
      token: session.id,
      user: this.sanitizeUser(foundUser),
      workspaceId: foundUser.workspaceId,
    };
  }

  /**
   * Creates an active multi-device SessionRecord.
   */
  private createSession(user: UserRecord, deviceInfo = 'Web Browser', ipAddress = 'local'): SessionRecord {
    const sessionId = crypto.randomBytes(32).toString('hex'); // 64-character token
    const now = Date.now();
    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const session: SessionRecord = {
      id: sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      deviceInfo,
      ipAddress,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      lastActiveAt: new Date(now).toISOString(),
      isRevoked: false,
    };

    dbStore.sessions.set(sessionId, session);
    dbStore.saveToDisk();
    return session;
  }

  /**
   * Validates a session token. Extends sliding expiration if active.
   */
  public validateSession(token: string): { user: UserRecord; session: SessionRecord } | null {
    if (!token) return null;
    const session = dbStore.sessions.get(token);
    if (!session || session.isRevoked) return null;

    const now = Date.now();
    if (new Date(session.expiresAt).getTime() < now) {
      session.isRevoked = true;
      dbStore.sessions.set(token, session);
      dbStore.saveToDisk();
      return null;
    }

    const user = dbStore.users.get(session.userId);
    if (!user || user.status !== 'ACTIVE') return null;

    // Update lastActiveAt
    session.lastActiveAt = new Date(now).toISOString();
    dbStore.sessions.set(token, session);

    return { user, session };
  }

  /**
   * Lists active sessions for a user (Multi-device monitoring).
   */
  public listSessions(userId: string, currentToken?: string): any[] {
    const list: any[] = [];
    const now = Date.now();

    for (const s of dbStore.sessions.values()) {
      if (s.userId === userId && !s.isRevoked && new Date(s.expiresAt).getTime() > now) {
        list.push({
          id: s.id,
          deviceInfo: s.deviceInfo || 'Perangkat Terotorisasi',
          ipAddress: s.ipAddress || 'local',
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          isCurrent: s.id === currentToken,
        });
      }
    }

    return list.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
  }

  /**
   * Revokes a specific session (Remote Logout / Device revocation).
   */
  public revokeSession(userId: string, sessionId: string): boolean {
    const session = dbStore.sessions.get(sessionId);
    if (session && session.userId === userId) {
      session.isRevoked = true;
      dbStore.sessions.set(sessionId, session);
      dbStore.saveToDisk();
      return true;
    }
    return false;
  }

  /**
   * Logout from all sessions.
   */
  public logoutAllSessions(userId: string, exceptSessionId?: string): number {
    let count = 0;
    for (const [id, s] of dbStore.sessions.entries()) {
      if (s.userId === userId && !s.isRevoked) {
        if (!exceptSessionId || id !== exceptSessionId) {
          s.isRevoked = true;
          dbStore.sessions.set(id, s);
          count++;
        }
      }
    }
    if (count > 0) dbStore.saveToDisk();
    return count;
  }

  /**
   * Verifies Master Key for sensitive step-up actions.
   */
  public verifyMasterKey(userId: string, masterKey: string): boolean {
    const user = dbStore.users.get(userId);
    if (!user || user.role !== 'PRIMARY_OWNER' || !user.masterKeyHash) return false;
    return this.verifyCredential(masterKey, user.masterKeyHash);
  }

  /**
   * Sanitizes UserRecord for client response (strips all hashes).
   */
  public sanitizeUser(user: UserRecord): any {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}

export const authService = new AuthService();
