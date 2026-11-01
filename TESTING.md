# Testing handoff — Habit Hero

Source branch: [feature/child-missions](https://github.com/anshulprojectmgmt/Coins-application/tree/feature/child-missions)  
Review: [PR #2](https://github.com/anshulprojectmgmt/Coins-application/pull/2)  
Hosted app: https://habitheroaj.onrender.com  
Setup and architecture: [README.md](README.md)

Test the feature branch rather than `main`: the pull request is still a draft and has not been merged. The frontend and backend are in this one repository.

## Start testing

For the hosted app, create a new test account with separate child and parent passwords. Use non-sensitive pictures of objects or work; faces, names and school details are unnecessary. A free Render service may take a while to wake up on the first request.

For a local test without database credentials or an AI key:

```sh
git clone --branch feature/child-missions --single-branch https://github.com/anshulprojectmgmt/Coins-application.git
cd Coins-application
npm ci
npm run demo
```

Requires Node.js 22 or later. Open http://localhost:3000.

Local demo credentials only:
- Username: `demo-hero`
- Child password: `demo-child-123`
- Parent password: `demo-parent-123`

The demo uses temporary data, starts with 20 coins, and disables AI. Stopping it discards its data. These credentials do not grant access to the hosted app.

## Core manual checks

Use a fresh account for the balance examples below.

| Check | Action | Expected result |
| --- | --- | --- |
| Account and parent access | Sign up, open Settings → Parent space, and enter the parent password. Try the child password too. | Only the parent password unlocks controls. Returning to child screens or refreshing locks them again. |
| Photo mission | Open Missions → Complete my worksheet. Select a valid photo and submit it. Starter missions use parent review. | Submission is saved with a parent-check status. No coins are awarded yet. |
| Parent approval | Open Parent space → Review and approve the worksheet. Refresh both views. | The child receives the fixed 15-coin reward and 15 surprise-progress points, recorded once in activity history. |
| Duplicate award | Try submitting that mission again the same day; repeat or double-click approval. | The same daily mission cannot award coins again. |
| Duplicate proof | Attempt to reuse the exact same image for another mission. | The reused image is rejected. Edited copies and staged scenes are not guaranteed to be detected. |
| Before and after | Start a toys/desk mission. Try one photo, the same photo twice, then two different photos. | Two distinct photos are required for a before-and-after mission. Valid proof is saved for checking. |
| Parent decisions | Decline another submitted mission with Try tomorrow. | No coins are awarded and the child sees the review result. The mission can be attempted on a later family day. |
| Rewards and balance | Set reward price to 2 coins/minute in Parent settings. With 15 coins, redeem 5 minutes. | Wallet decreases to 5, surprise progress stays at 15, and spending more than the wallet is blocked. |
| Surprise | With surprise progress at 15, set a 10-coin goal and a secret reward in Parent settings. Claim it from Surprise. | The secret reward is revealed, progress becomes 5 and the wallet is unchanged. Repeating the claim with insufficient progress is blocked. |
| Permissions | Try changing mission rewards or prices from child screens; leave and reopen Parent space. | Children have no point-entry or rule-editing control. Parent access requires unlocking again. |
| Private photos | View proof in the parent inbox, then revoke photo permission in Parent settings. | Existing photos are deleted, new uploads are blocked, and child sessions cannot fetch parent-only evidence. |
| Devices and errors | Test on a phone and desktop. Try an unsupported file, a photo over 4 MB, and a network interruption. | Layout remains usable; invalid uploads are explained and saved submissions remain visible after refresh. |

Exact database cleanup and race conditions are covered by automated tests. To check the seven-day retention manually, use an isolated test database; do not alter production records or clocks.

## Automatic AI checks

AI integration is present, but actual AI testing requires all three:
1. A server-only `OPENAI_API_KEY` configured privately in the hosting environment.
2. Parent consent to AI processing in Parent settings.
3. Automatic AI check selected on the mission.

Without these, submissions enter parent review; that is expected behavior. Never commit or send API keys, database strings or passwords in bug reports.

If AI is enabled, test clear, incomplete and blurry submissions against the parent's instructions. A clear pass may award the fixed points; unclear proof should go to review or request a retake. There are at most three attempts per daily mission before parent review. Provider failures and timeouts should preserve the proof for review. Assess false approvals and false rejections explicitly: integration tests use deterministic verdicts and do not establish live AI accuracy.

Photos cannot prove identity, who did the work, elapsed time or sustained reading. There is no face recognition or liveness verification.

## Automated verification

```sh
npm run lint
npm test
npm run test:ui
```

The last implementation verification passed TypeScript, 28 tests, a production build and the complete browser flow. Re-run these commands on your checkout; that result is historical, not a claim that they have been run again today. Tests use isolated local databases, not production, and do not call a paid AI API.

The browser test uses system Chromium when available. Otherwise run `npx playwright install chromium` or set `CHROMIUM_PATH`. The first database test run may download the MongoDB test binary.

## Current scope

This version supports photos and one child profile per account. Video/audio evidence, a multi-child family dashboard, reading timers/quizzes, notifications and automatic control of external games/videos are not included. Parents still fulfil physical rewards.

## Report a bug

Include:
- Short title and whether it blocks testing.
- Hosted app or local checkout, branch/commit, browser and device.
- Steps to reproduce.
- Expected behavior and actual behavior.
- Coin balance and surprise progress before/after, when relevant.
- A screenshot with private details removed.

Report against [the repository's issues](https://github.com/anshulprojectmgmt/Coins-application/issues) or send findings to Anshul. Do not include children's photos, credentials, authentication tokens or private database data.
