# Mission MedIQ

Individual healthcare assessment played as a quiz-race. Node 22 server, built-in SQLite database (WAL), no build step.
Answer keys, scoring, the clock and trainer sign-in all live on the server.

## Status: not deployed
This folder is the complete application. A shared assessment needs it running on a host that can reach the internet and keep a disk.
No public URL exists until you do the deployment steps below. Quick (quick.healthcatalyst.net) cannot host it: it is static-only and every employee can open every site.

## Deploy (about 15 minutes, any container host with a persistent disk)
1. Create the trainer password hash: `node tools/hash-password.js "a long passphrase"` and keep the output.
2. Deploy this folder as a Docker service (Render, Fly.io, Azure Container Apps, AWS App Runner/ECS, or an internal VM). Mount a persistent disk at `/data`. Run exactly ONE instance (SQLite).
3. Set environment variables:
   - `TRAINER_PASSWORD_HASH` = the value from step 1 (required in production)
   - `ALLOWED_EMAIL_DOMAINS` = `healthcatalyst.com` (default; comma separated; can also be set per room)
   - `SESSION_SECRET` = any long random string (optional; if unset one is generated and stored in the database)
   - `ATTEMPT_MINUTES` = 20 (default)
   - Serve over HTTPS (the host normally does this). Trainer cookie is HttpOnly, SameSite=Strict, Secure.
4. Open `https://YOUR-HOST/trainer`, sign in, and create a room.

Local trial: `npm install`, then `TRAINER_PASSWORD=choose-one node server.js` and open http://localhost:3000/trainer (local only; do not share it as the real assessment).

## Trainer guide
1. Sign in at `/trainer`. Create a room (name, pass mark, allowed email domains). The pass mark can only be changed while the room is in draft.
2. Share the participant link (`/?room=CODE`) or the 6-character room code. Players enter email, full name and a display name, then see the briefing. They get a resume code to continue on another device.
3. Click Open room for play. Players press Start Mission and have 20 minutes from that moment. Close room stops new starts; active attempts finish normally.
4. Click Open projection screen on the room page to project the race. It refreshes every 10 s and shows display names only; points appear after a player submits. Standings are provisional until all active attempts finish.
5. Dashboard: joined / active / reconnecting / submitted / expired, per-participant answers, session scores and attempt history. Flags: `Recovered import` and `Offline expiry: review`.
6. If a participant's final sync failed they can download a recovery file. Use Import recovery file (room page). It is signed to that attempt, scored on the server and marked as a recovery import in the dashboard and Excel.
7. Download Excel results at any time: Participant Results, Session Performance, Answer Details, Question Analysis (plus Question Option Distribution) and Question Bank.
8. Resume code lost? Details > Reset resume code.

## Rules implemented
60 questions (6 per session); each attempt draws 2 per session (20), shuffles options, persists both. 100 points per correct answer; one overall server-side countdown; auto-submit at expiry; no correctness or explanations until submission. Retries create new attempts and keep history; rankings use first attempts only, ties broken by shorter duration.

## Limits to know
- Display-name and domain checks are not identity verification. Resume codes stop casual impersonation; they are not strong authentication.
- Offline-expiry and recovery-file answers rely on the participant's device timing and are flagged for review rather than treated as verified.
- Recovery files are signed per attempt but contain answers the participant could edit; treat them as unverified.
- Single instance + SQLite is sized for a classroom (tens to low hundreds of players). Back up the `/data` volume.
- All questions are written from the approved decks and need a subject matter expert read before live use.

## Tests
`npm test` (API end to end: scoring, shuffling, leaks, recovery, expiry, export) and `node test/ui-smoke.js` (jsdom UI walk-through; not a real-browser test).
