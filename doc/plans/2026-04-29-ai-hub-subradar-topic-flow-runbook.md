# AI HUB SubRadar Topic Flow Runbook

Date: 2026-04-29
Owner context: AI HUB company in Paperclip
Purpose: give the next Codex/Paperclip session one authoritative continuation plan.

## Executive Summary

AI HUB exists to run the AIwBiznesie content business workflow through Paperclip, not to let agents invent random topics.

The sacred workflow is:

```text
SubRadar source list
  -> AI News Radar intake
  -> Topic Curator Top 5 selection
  -> operator approval
  -> Content Production
  -> QA
  -> Distribution
  -> KPI/feedback loop
```

Current status:

- Paperclip service is running at `https://pep.aihub.ovh` and locally on port `3100`.
- WhatsApp bridge is running locally on port `3000`, connected, and configured to talk to Paperclip at `http://localhost:3100`.
- The dashboard has a new `Content Topics` surface backed by Paperclip issue documents and approvals.
- The first valid SubRadar intake exists: AIH-5, issue id `3d957db4-d67b-498d-ae4c-4ef6ee451d95`, document key `subradar-source-list`, status `done`.
- The first valid Top 5 decision exists: AIH-6, issue id `580155bd-36ed-4937-8b0e-901df7bae186`, document key `top5-decision`, status `in_review`.
- The current operator approval is pending: `7bceeb3a-8e23-42d8-9770-e18ffb0436e7`, type `request_board_approval`, `payload.kind = "content_topic_selection"`, 5 topics.
- Dashboard now shows `sourceBatches: 1`, `selectionDocuments: 1`, `pendingApprovals: 1`, with pending selection linked to `AIH-6` and 5 topic titles.
- WhatsApp sent a corrected Top 5 approval notification containing all 5 topic lines.
- Historical AIH-3 and AIH-4 are cancelled and must not be used as source material because they were model-invented, not SubRadar-based.

The next session must not restart from creative brainstorming. It must wait for the operator decision on approval `7bceeb3a-8e23-42d8-9770-e18ffb0436e7`, then either start production from the approved topics or request a revised Top 5.

## Non-Negotiable Rules

1. No invented topics.
   Agents must use only SubRadar or an explicit operator-provided source list. If no source list exists, the issue is blocked.

2. No skipping stages.
   Intake, Top 5 decision, approval, production, QA, distribution, and KPI are separate stages.

3. No publishing without approval.
   A Top 5 approval must exist and be approved by the operator before production moves forward.

4. Keep AI HUB skills minimal.
   Company skills should remain limited to the Paperclip skill unless the operator explicitly approves more.

5. Keep model/provider config stable.
   AI HUB agents are intended to use `ollama-local/glm-5.1:cloud`. Do not introduce Gemini, ElevenLabs, Anthropic, or other providers unless the operator explicitly changes the plan.

6. Do not use cancelled AIH-3/AIH-4 outputs.
   They are audit artifacts only.

7. Do not fake run IDs.
   If running inside a Paperclip heartbeat, use the injected `PAPERCLIP_RUN_ID` for mutating issue API calls. If working manually through board credentials outside a heartbeat, use the UI or a valid board-authenticated request; do not invent `X-Paperclip-Run-Id`.

## Known IDs

AI HUB company:

- Company id: `6398f881-6697-4978-a273-75e8b70034b4`
- Issue prefix: `AIH`
- Project id: `a79dafb8-cb0a-4858-91cc-f8aee20ba157`
- Root goal id: `0dd1cde1-1e28-41d0-900b-87e7f446dccc`

AI HUB agents:

- CEO: `03080620-315e-4e8d-adfe-d05c3b2e285a`
- AI News Radar: `5fc230a1-79b3-4800-b850-aa44ac9c2f52`
- Topic Curator: `7e6811fb-d5da-4f8f-aacf-094f59fdb236`
- Content Production: `fbc3df4e-c90e-4e84-8b97-ae49814e71d1`
- QA: `0e38363e-f966-4342-8636-d4b813d97d6a`
- Distribution: `5a41be90-fc22-4433-8ed0-420bb71fd9a8`
- KPI: `6a7c23eb-3fcc-404e-a2f3-1c279c13200d`

Important prior issues:

- AIH-1: root plan / sacred flow. Done.
- AIH-2: skill whitelist. Done.
- AIH-3: invalid radar candidates. Cancelled because topics were not from SubRadar.
- AIH-4: invalid Top 5. Cancelled because it selected from invalid AIH-3 output.

## Runtime State Verified

Last verified on 2026-04-29:

```bash
curl -sS http://127.0.0.1:3100/api/health
```

Expected:

```json
{"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"ready","bootstrapInviteActive":false}
```

```bash
curl -sS http://127.0.0.1:3000/health
```

Expected core fields:

```json
{
  "connection": "connected",
  "mode": "self-chat",
  "paperclipApiUrl": "http://localhost:3100",
  "paperclipConfigured": true
}
```

```bash
ss -ltnp | grep -E ':3000|:3100|:3101'
```

Expected:

- `0.0.0.0:3000` for WhatsApp bridge
- `0.0.0.0:3100` for Paperclip
- no listener on `3101`

Public UI:

- `https://pep.aihub.ovh/AIH/dashboard`
- `https://pep.aihub.ovh/api/health`

If Paperclip falls back to `3101`, stop the duplicate process and restart the default instance with:

```bash
cd /home/agent/paperclip
HOME=/home/agent \
PAPERCLIP_HOME=/srv/paperclip-home \
PAPERCLIP_INSTANCE_ID=default \
nohup pnpm paperclipai run \
  --data-dir /srv/paperclip-home \
  --instance default \
  --config /srv/paperclip-home/instances/default/config.json \
  > /tmp/paperclip-run.log 2>&1 &
```

Then verify `3100` again.

## What Was Implemented

Repo changes for the dashboard/topic surface:

- `packages/shared/src/types/dashboard.ts`
  - added content-topic dashboard summary types.
- `packages/shared/src/types/index.ts`
  - exports new dashboard topic types.
- `packages/shared/src/index.ts`
  - exports new dashboard topic types.
- `server/src/services/dashboard.ts`
  - returns `contentTopics`.
  - reads source documents by keys:
    - `subradar-source-list`
    - `subradar-sources`
    - `source-list`
  - reads Top 5 selection documents by keys:
    - `top5-decision`
    - `top5-topics`
    - `topic-selection`
  - reads pending approvals with `payload.kind === "content_topic_selection"`.
  - excludes cancelled issues so AIH-3/AIH-4 do not pollute current dashboard state.
- `ui/src/pages/Dashboard.tsx`
  - renders the `Content Topics` panel.
- `ui/src/components/ApprovalPayload.tsx`
  - renders topic lists inside board approvals.
- `server/src/__tests__/dashboard-service.test.ts`
  - verifies topic docs and pending Top 5 approval show in dashboard summary.
- `ui/src/lib/inbox.test.ts`
  - updated dashboard fixture.
- `ui/storybook/fixtures/paperclipData.ts`
  - updated dashboard fixture.

Runtime bridge changes:

- `/srv/paperclip-home/instances/default/runtime-services/whatsapp-bridge/notifier.js`
  - snapshots approvals.
  - emits `approval_requested` notifications.
  - includes Top 5 topic titles and reply commands.
- `/srv/paperclip-home/instances/default/runtime-services/whatsapp-bridge/notification-state.js`
  - persists `approvalSnapshots`.
- `/srv/paperclip-home/instances/default/runtime-services/whatsapp-bridge/.env`
  - switched default company and routing rules to AI HUB.
- `/srv/paperclip-home/instances/default/runtime-services/whatsapp-bridge/README.md`
  - documents approval notifications and re-baselining.

## Verification Already Done

WhatsApp bridge:

```bash
cd /srv/paperclip-home/instances/default/runtime-services/whatsapp-bridge
npm test
npm run check
```

Result:

- `npm test`: 47/47 passed.
- `npm run check`: passed.

Paperclip repo:

```bash
cd /home/agent/paperclip
pnpm --filter @paperclipai/shared build
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui typecheck
pnpm --filter @paperclipai/ui build
pnpm --filter @paperclipai/server build
pnpm --filter @paperclipai/server exec vitest run src/__tests__/dashboard-service.test.ts
```

Result:

- all commands passed.
- embedded Postgres-dependent test setup skipped on this host because `/home/agent` is not world-executable; this is an environment limitation, not a failure of the dashboard logic.

Real DB rollback check:

- inserted synthetic SubRadar source document, Top 5 document, and pending `content_topic_selection` approval inside a transaction.
- dashboard returned:
  - `sourceBatches: 1`
  - `selectionDocuments: 1`
  - `pendingApprovals: 1`
  - first topic title visible.
- transaction rolled back and left no `TMP-*` issues.

Current live dashboard API, authenticated through board key, returns:

```json
{
  "sourceBatches": 1,
  "selectionDocuments": 1,
  "pendingApprovals": 1,
  "pendingSelection": {
    "id": "7bceeb3a-8e23-42d8-9770-e18ffb0436e7",
    "issueIdentifier": "AIH-6",
    "topicCount": 5
  }
}
```

This is correct while operator approval is pending.

## Document Contracts

### Source Document

Issue document key:

```text
subradar-source-list
```

Required meaning:

- exact input source list for the current content cycle.
- must come from SubRadar or from an explicit operator-provided list.
- should include 10-20 source items; if the operator asked for 20, use 20.

Recommended markdown body:

```markdown
# SubRadar source list

Source batch id: <subradar batch id or URL>
Collected at: <ISO timestamp>
Operator constraint: only these sources may be used for Top 5 selection

| # | Source title | Source URL | Channel/author | Published at | Why relevant | Risk/notes |
|---|--------------|------------|----------------|--------------|--------------|------------|
| 1 | ... | ... | ... | ... | ... | ... |
```

### Top 5 Document

Issue document key:

```text
top5-decision
```

Required meaning:

- chosen only from `subradar-source-list`.
- no model-invented additions.
- should be ready for operator approval, not already accepted.

Recommended markdown body:

```markdown
# Top 5 decision

Source issue: AIH-<source intake issue number>
Source document: subradar-source-list
Status: ready_for_operator_approval

## Selected Top 5

1. <topic title>
   - Source: <source title + URL>
   - Business angle:
   - Why now:
   - Suggested format:
   - Risk:

...

## Rejected but notable

...
```

### Approval Payload

Approval type:

```text
request_board_approval
```

Payload contract:

```json
{
  "kind": "content_topic_selection",
  "source": "subradar",
  "title": "Approve Top 5 AIwBiznesie topics",
  "summary": "Chosen only from SubRadar source videos.",
  "issueId": "<top5 issue id>",
  "sourceIssueId": "<subradar intake issue id>",
  "topics": [
    {
      "rank": 1,
      "title": "<topic title>",
      "sourceTitle": "<SubRadar source title>",
      "sourceUrl": "<source URL>",
      "businessAngle": "<why this matters to business users>",
      "suggestedFormat": "<short/Reels/post/newsletter/etc>",
      "risk": "<uncertainty or compliance risk>"
    }
  ]
}
```

The dashboard and WhatsApp notifier look for `kind: "content_topic_selection"` and `topics`.

## Next Session TODO

### 0. Preflight

- [ ] Open this file first.
- [ ] Confirm the user still wants to continue the AI HUB SubRadar workflow.
- [ ] Verify Paperclip:

```bash
curl -sS http://127.0.0.1:3100/api/health
```

- [ ] Verify WhatsApp bridge:

```bash
curl -sS http://127.0.0.1:3000/health
```

- [ ] Verify public dashboard:

```bash
curl -sSI https://pep.aihub.ovh/AIH/dashboard | head
```

- [ ] Check that no active AI HUB work is already running before creating new work.

### 1. Create the Real SubRadar Intake Issue

Create one new AI HUB issue assigned to AI News Radar.

Suggested title:

```text
AI HUB - SubRadar intake: zapisz 20 zrodel do wyboru Top 5
```

Suggested fields:

- `companyId`: `6398f881-6697-4978-a273-75e8b70034b4`
- `projectId`: `a79dafb8-cb0a-4858-91cc-f8aee20ba157`
- `goalId`: `0dd1cde1-1e28-41d0-900b-87e7f446dccc`
- `assigneeAgentId`: `5fc230a1-79b3-4800-b850-aa44ac9c2f52`
- `priority`: `high`
- `status`: `todo`

Acceptance criteria:

- reads only from SubRadar or explicit operator-provided source list.
- writes issue document `subradar-source-list`.
- includes source URL/title/author/date/why relevant/risk for each item.
- if SubRadar is unavailable or empty, marks the issue `blocked` and asks operator for the source list.
- does not choose Top 5.
- does not create production content.
- does not publish.

### 2. Wake AI News Radar Once

- [ ] Wake the assigned AI News Radar agent for the intake issue.
- [ ] Let it produce only the `subradar-source-list` document.
- [ ] Watch for invalid behavior:
  - loading forbidden skills,
  - inventing topics,
  - using old AIH-3/AIH-4,
  - trying to select Top 5,
  - trying to publish.
- [ ] If invalid, cancel/revise immediately and preserve the reason in comments.

Done condition:

- [ ] source issue is `done`.
- [ ] document `subradar-source-list` exists and is valid.
- [ ] dashboard `contentTopics.sourceBatches` increases to at least `1`.

### 3. Create Top 5 Decision Issue

Create one child issue assigned to Topic Curator.

Suggested title:

```text
AI HUB - Top 5 tematow z SubRadar do akceptacji operatora
```

Suggested fields:

- `parentId`: source intake issue id
- `projectId`: `a79dafb8-cb0a-4858-91cc-f8aee20ba157`
- `goalId`: `0dd1cde1-1e28-41d0-900b-87e7f446dccc`
- `assigneeAgentId`: `7e6811fb-d5da-4f8f-aacf-094f59fdb236`
- `priority`: `high`
- `status`: `todo`

Acceptance criteria:

- reads only the parent issue document `subradar-source-list`.
- chooses exactly 5 topics.
- writes document `top5-decision`.
- creates or requests a pending board approval using the `content_topic_selection` payload contract.
- does not claim operator approval until the approval is actually approved.
- does not create production content.

### 4. Create or Verify the Board Approval

The approval must be linked to the Top 5 issue.

Endpoint shape:

```http
POST /api/companies/6398f881-6697-4978-a273-75e8b70034b4/approvals
Authorization: Bearer <board or valid Paperclip token>
Content-Type: application/json
```

Body shape:

```json
{
  "type": "request_board_approval",
  "payload": {
    "kind": "content_topic_selection",
    "source": "subradar",
    "title": "Approve Top 5 AIwBiznesie topics",
    "summary": "Chosen only from SubRadar source videos.",
    "issueId": "<top5 issue id>",
    "sourceIssueId": "<source issue id>",
    "topics": []
  },
  "issueIds": ["<top5 issue id>"]
}
```

Done condition:

- [x] approval status is `pending`.
- [x] dashboard `contentTopics.pendingApprovals` is at least `1`.
- [x] dashboard shows pending topic titles.
- [x] WhatsApp bridge sent a corrected approval notification with all 5 topic titles.

### 5. Operator Approval

- [ ] Operator opens dashboard or WhatsApp notification.
- [ ] Operator approves, rejects, or requests revision.
- [ ] If revision requested, Topic Curator updates `top5-decision` and resubmits approval.
- [ ] If approved, move to production.

Do not start production before approval.

### 6. Content Production Issue

Only after approval:

Create issue assigned to Content Production.

Suggested title:

```text
AI HUB - Produkcja materialu dla zatwierdzonego tematu #1
```

Rules:

- pick only one approved topic first.
- produce draft/scenario/post assets only.
- no publishing.
- keep references to approval id and source issue.

### 7. QA Issue

Create issue assigned to QA.

Rules:

- verify factual consistency with SubRadar source.
- verify business angle for AIwBiznesie audience.
- verify no hallucinated claims.
- verify CTA/UTM assumptions are explicit.
- return changes if needed.

### 8. Distribution Issue

Only after QA passes:

Create issue assigned to Distribution.

Rules:

- publish only approved QA output.
- record target channels, URLs, and scheduled/published status.
- do not change the approved topic angle without new approval.

### 9. KPI Issue

Create issue assigned to KPI.

Rules:

- record channel metrics.
- record CTA/UTM/lead signals where available.
- feed learnings into the next SubRadar selection cycle.

## Commands Useful For Next Session

Check service ports:

```bash
ss -ltnp | grep -E ':3000|:3100|:3101'
```

Check Paperclip logs:

```bash
tail -120 /srv/paperclip-home/instances/default/logs/server.log
```

Check bridge logs:

```bash
journalctl -u paperclip-whatsapp-bridge --since '10 minutes ago' --no-pager
```

Check bridge health:

```bash
curl -sS http://127.0.0.1:3000/health
```

Check dashboard topic summary with board key available from bridge runtime env:

```bash
set -a
source /srv/paperclip-home/instances/default/runtime-services/whatsapp-bridge/.env
set +a

curl -sS \
  -H "Authorization: Bearer $PAPERCLIP_BOARD_API_KEY" \
  http://127.0.0.1:3100/api/companies/6398f881-6697-4978-a273-75e8b70034b4/dashboard \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(JSON.stringify(j.contentTopics,null,2));})'
```

Never paste `$PAPERCLIP_BOARD_API_KEY` into chat, docs, issue comments, or commits.

## Known Risks

1. Dirty worktree.
   `/home/agent/paperclip` has many unrelated pre-existing modifications. Do not commit all files blindly.

2. Auto-reimport of bundled skills.
   Paperclip may reintroduce bundled company skills through skill list/sync paths. If the AI HUB skill list is polluted, clean it back to Paperclip-only and record the reason.

3. Runtime port drift.
   Starting Paperclip without the intended environment may create a second server on `3101`. Keep the default AI HUB instance on `3100`.

4. Approval still pending.
   The real SubRadar Top 5 approval exists and was sent to WhatsApp, but production must not start until the operator approves it.

5. Embedded Postgres tests skip on this host.
   Some tests skip because `/home/agent` permissions prevent the embedded Postgres user from executing binaries there.

## Definition Of Done For The Next Real Workflow Slice

The current intake/decision slice is done only when all are true:

- [x] A real SubRadar intake issue exists and is done.
- [x] It has `subradar-source-list`.
- [x] A Top 5 issue exists and is waiting on operator approval.
- [x] It has `top5-decision`.
- [x] A pending `content_topic_selection` board approval exists and is linked to the Top 5 issue.
- [x] Dashboard shows the source batch, selection document, pending approval, and 5 topic titles.
- [x] WhatsApp bridge has sent an approval notification with 5 topic titles.
- [x] No production/publishing was started before approval.
- [x] A checkpoint is appended to `/root/.omx/notepad.md`.

The next slice starts only after operator decision on approval `7bceeb3a-8e23-42d8-9770-e18ffb0436e7`.
