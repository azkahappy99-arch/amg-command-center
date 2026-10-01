/**
 * AMG — Email & Access Code Notification Service
 * Dispatches verification codes for new User Access Requests to the Primary Owner's Master Gmail.
 */

import nodemailer from 'nodemailer';
import { dbStore } from './db.js';

export interface EmailDispatchResult {
  sentViaSmtp: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private transporter: any = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || process.env.MASTER_GMAIL;
    const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

    if (user && pass) {
      try {
        this.transporter = (nodemailer as any).createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        console.log(`[EmailService] SMTP Transporter initialized with user: ${user}`);
      } catch (err) {
        console.warn('[EmailService] Could not initialize SMTP transporter:', err);
      }
    }
  }

  /**
   * Dispatches 6-digit access code to Primary Owner's Master Gmail.
   */
  public async sendUserAccessCodeToOwner(params: {
    masterGmail: string;
    requesterEmail: string;
    accessCode: string;
    expiresAt: string;
  }): Promise<EmailDispatchResult> {
    const { masterGmail, requesterEmail, accessCode, expiresAt } = params;

    // 1. Always create an in-app notification in AMG Command Center for the Primary Owner
    const nowIso = new Date().toISOString();
    const notifId = `notif-req-${Date.now()}`;
    dbStore.notifications.set(notifId, {
      id: notifId,
      type: 'info',
      title: `Permintaan Akses Baru: ${requesterEmail}`,
      message: `User ${requesterEmail} meminta akses ke AMG Command Center. Kode verifikasi 6-digit: ${accessCode} (berlaku hingga ${new Date(expiresAt).toLocaleTimeString('id-ID')}). Berikan kode ini kepada user jika Anda menyetujui aksesnya.`,
      channelId: '',
      createdAt: nowIso,
      read: false,
    });
    dbStore.saveToDisk();

    // 2. Log clearly to server console
    console.log('=================================================================');
    console.log('[AMG SECURITY] DISPATCHING ACCESS CODE TO MASTER GMAIL');
    console.log(`[AMG SECURITY] Target (Owner): ${masterGmail}`);
    console.log(`[AMG SECURITY] Requester:    ${requesterEmail}`);
    console.log(`[AMG SECURITY] Access Code:  ${accessCode}`);
    console.log(`[AMG SECURITY] Expires At:   ${expiresAt}`);
    console.log('=================================================================');

    // 3. If SMTP is configured, send real email to Master Gmail
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `"AMG Command Center Security" <${process.env.SMTP_USER || masterGmail}>`,
          to: masterGmail,
          subject: `[AMG Security] Kode Otorisasi Akses Pengguna Baru: ${accessCode}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #0a0a0a; color: #f5f5f5; border-radius: 16px; border: 1px solid #262626;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #ef4444; font-size: 20px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 1px;">AMG Command Center</h1>
                <p style="color: #a3a3a3; font-size: 12px; margin: 4px 0 0;">Otorisasi Akses Pengguna Baru</p>
              </div>

              <div style="background-color: #171717; border: 1px solid #333333; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: #d4d4d4;">
                  Halo Primary Owner,
                </p>
                <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #d4d4d4;">
                  Pengguna berikut telah mengajukan permintaan akses ke AMG Command Center:
                </p>
                <div style="background-color: #262626; padding: 10px 14px; border-radius: 8px; font-family: monospace; font-size: 14px; color: #38bdf8; margin-bottom: 16px;">
                  ${requesterEmail}
                </div>
                <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: #d4d4d4;">
                  Berikut adalah <strong>Kode Verifikasi 6-Digit</strong> sekali pakai untuk diberikan kepada user tersebut jika Anda mengizinkannya:
                </p>
                <div style="text-align: center; margin: 20px 0;">
                  <span style="display: inline-block; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #000; color: #fbbf24; padding: 14px 28px; border-radius: 12px; border: 2px solid #b45309;">
                    ${accessCode}
                  </span>
                </div>
                <p style="margin: 0; font-size: 12px; color: #737373; text-align: center;">
                  Kode ini berlaku selama 15 menit (hingga ${new Date(expiresAt).toLocaleTimeString('id-ID')}).
                </p>
              </div>

              <div style="font-size: 11px; color: #737373; line-height: 1.5; text-align: center;">
                <p style="margin: 0;">
                  Setelah diverifikasi, pengguna ini hanya akan mendapatkan role <strong>USER</strong> dengan workspace kosong yang terisolasi total dari data milik Anda.
                </p>
                <p style="margin: 8px 0 0;">
                  © 2026 Azka Media Group • Security & Access Control
                </p>
              </div>
            </div>
          `,
        });

        console.log(`[EmailService] Email successfully sent to ${masterGmail}. MessageId: ${info.messageId}`);
        return { sentViaSmtp: true, messageId: info.messageId };
      } catch (err: any) {
        console.warn(`[EmailService] SMTP send failed to ${masterGmail}:`, err.message);
        return { sentViaSmtp: false, error: err.message };
      }
    }

    return { sentViaSmtp: false };
  }
}

export const emailService = new EmailService();
