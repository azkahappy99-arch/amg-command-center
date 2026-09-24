# AMG — Security Specification & Access Control Model

## 1. Data Invariants
- YouTube OAuth tokens, refresh tokens, and credentials MUST NEVER be accessible or readable by the frontend client. Sensitive connection records are stored server-side.
- A video cannot be marked as MANAGED or SCHEDULED without an associated Channel and Content Profile.
- Round-robin rotation indexes must remain strictly deterministic.
- Videos can only be modified if the user has an active operator or admin role.
- Scheduled dates must never overwrite existing verified YouTube schedules.

## 2. The "Dirty Dozen" Attack Vectors Prevented
1. Unauthorized Token Read: Non-admin trying to read OAuth credentials in `youtube_connections`.
2. Spoofed Channel Association: Creating a Video record linked to a non-existent or unowned Channel.
3. Shadow Field Injection: Adding arbitrary admin flags or unverified states to Video documents.
4. Terminal State Mutation: Reverting a COMPLETED or VERIFIED video operation arbitrarily.
5. Large String / DOS Payload: Injecting multi-megabyte titles or IDs.
6. Premature Status Escalation: Moving from DISCOVERED directly to COMPLETED without verification steps.
7. Unauthenticated Channel Deletion: Deleting channels without proper authentication.
8. Schedule Collision Attack: Attempting to schedule duplicate slots for the same video.
9. Privilege Escalation: Self-assigning admin roles in the User document.
10. Unbounded Array Inflation: Appending unlimited master titles to crash rendering.
11. Client-Side Video Tampering: Overwriting verified YouTube video IDs.
12. Blanket List Scraping: Attempting to list all channels across other organizations.
