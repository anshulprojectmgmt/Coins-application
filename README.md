# Habit Hero

A mobile-first habit and reward app that children can operate themselves. Parents create daily missions with fixed coin rewards. Children submit photos, and missions either award coins after an automatic AI check or enter the parent review inbox.

## Try it without a database or API key

Requires Node.js 22 or later.

```sh
npm ci
npm run demo
```

Open `http://localhost:3000`.

- Username: `demo-hero`
- Child sign-in: `demo-child-123`
- Parent controls: `demo-parent-123`

The demo uses a temporary local MongoDB replica set, deletes its data when stopped, and does not call AI. The first run may download the MongoDB test binary. Submit a photo and approve it in **Settings → Parent space** to try the complete flow. These demo credentials are exclusively for this isolated local demo.

## Run with your own database

```sh
npm ci
cp .env.example .env
# Edit .env with your private configuration.
npm run dev
```

Required configuration:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas or another replica set. Transactions are required to award coins atomically. A standalone MongoDB server is insufficient. |
| `JWT_SECRET` | A private random secret, at least 32 characters. Generate with `openssl rand -hex 32`. |
| `EVIDENCE_DIR` | Private persistent storage outside `public/` and `dist/`. Defaults to `./private-evidence`. |
| `OPENAI_API_KEY` | Optional server-only key for AI checks. Without it, submissions go to parent review. |
| `OPENAI_VISION_MODEL` | Vision model supporting Chat Completions, image inputs and structured JSON output. Defaults to `gpt-4.1-mini`. |
| `TRUST_PROXY_HOPS` | Defaults to `0`. Set to the exact number of trusted reverse proxies for correct IP rate limiting; do not enable it on an untrusted/direct network path. |

Never use a `VITE_` prefix for the API key, database connection or JWT secret: that would expose them in the browser bundle.

The earlier `.env.example` contained credential-like values. They have been removed here, but remain in Git history. Rotate the old database credentials and JWT secret before deployment. Do not reuse them.

## Parent setup

For a new account, a parent creates the child sign-in password, a separate parent password, and consents to private photo submissions. One account represents one child profile in this first version.

Existing accounts retain their coin balances, activity history and surprise progress. Before giving the app back to a child, open **Settings → Parent space**, verify the existing account password, and create a separate parent password. This one-time setup creates three starter missions. Complete this migration yourself: an existing account password may already be known to the child.

Parent controls support:

- Creating, editing and pausing up to 20 daily missions, with 1–100 coins each.
- Choosing a completed-work photo or a before-and-after pair.
- Choosing parent review or automatic AI checking per mission.
- Reviewing unclear submissions and approving or declining them.
- Configuring timed rewards, coin prices, family time zone, secret surprise and milestone goal.
- A seven-day summary of completed missions, earned coins and pending checks.
- Photo and AI consent controls. Revoking photo consent deletes existing local evidence and blocks new submissions.

Parent access uses a separate server-verified password and a scoped token that expires after 15 minutes. The UI keeps this token only in memory and locks when refreshed or when leaving the parent screens. Children cannot change points, reward prices or mission rules through the API.

## Enable automatic awards

1. Configure a private `OPENAI_API_KEY` on the server and restart it.
2. In **Parent space → Settings**, opt into sending task photos to OpenAI.
3. In **Missions**, edit a suitable mission and choose **Automatic AI check**.
4. Trial the mission with representative good, unclear and incomplete submissions before relying on automatic awards.

AI checks compare photos with the parent's saved criteria and return `pass`, `retry` or `review`. Only a pass can trigger a fixed server-owned award. Unclear evidence, provider errors, timeouts, invalid model output and absent keys go to review. Up to three attempts are allowed per daily mission; after that, a parent can review it. Checks interrupted by a restart move to review after two minutes, when the mission screen or inbox is next opened.

AI is not proof of identity, authorship or elapsed time. Keep automatic missions focused on visible outcomes, such as putting toys away. A worksheet photo cannot prove who completed it, and a book photo cannot prove 20 minutes of reading. The instructions tell the model to request review for these claims. Exact normalized duplicate photos are blocked; edited copies, new camera photos of old work and staged scenes are not reliably detected. There is no facial recognition or liveness check.

## Photos, rewards and surprises

Children can take/select JPG, PNG or WebP photos, up to 4 MB each. Images are decoded, resized and re-encoded to remove EXIF/location metadata. Faces are unnecessary. Evidence is available only through authenticated parent endpoints for the same account, never through a public media URL. Local evidence access expires after seven days; startup and hourly cleanup remove expired files. If the server was stopped, cleanup runs when it next starts. Orphaned uploads are included in cleanup. Configure any backups with the same retention policy.

Mission history and normalized photo hashes remain after photo deletion for activity history and duplicate prevention. Images sent for AI checks are also subject to the AI provider's data handling; local cleanup cannot delete provider-side records. Parent consent is required before sending them.

Coin awards, activity ledger entries and surprise progress are written in one MongoDB transaction. Unique indexes prevent more than one submission per mission per family day and more than one ledger award per submission. Existing submissions preserve the reward and criteria from the time they were submitted. A deliberate retake uses the current mission rules, displayed on the mission card.

Spending uses the parent's server-owned price, validates the balance, and accepts an idempotency key so retrying a request cannot charge twice. Spending reduces the wallet only. Surprise claims consume the milestone progress, preserve excess progress and reveal the secret reward. Timed rewards record permission to use a game or video; the app does not control other applications or devices. Parents still fulfil physical gifts.

This release is photo-based. Video/audio evidence, reading timers/quizzes, push notifications and a multi-child family dashboard are not included.

## Production

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

Serve the app over HTTPS. Keep `EVIDENCE_DIR` on a private persistent volume, and run a single application instance with that volume in this version. For multiple replicas or ephemeral/serverless hosting, first replace the filesystem evidence adapter with private object storage, object lifecycle deletion, and a shared rate-limit store. No automatic deployment or database credential changes are performed by this implementation.

## Verification

```sh
npm run lint
npm test
npm run test:ui
```

Backend integration tests use an isolated MongoDB replica set and deterministic verifier responses, covering parent permissions, account isolation, duplicate photos, concurrent submissions/approvals, retakes, consent revocation, expiry, legacy migration, server-priced spending, overspending, surprise progress and provider failure fallback. They never use the production database or call a paid AI API.

The browser smoke test builds the app and exercises signup, photo upload, parent review, awarding, spending, surprise reveal, parent relocking and phone/desktop widths. It uses `/usr/bin/chromium` when available; otherwise install a Playwright Chromium browser with `npx playwright install chromium`. You can also set `CHROMIUM_PATH`. Screenshots are saved under the ignored `test-results/` directory.
