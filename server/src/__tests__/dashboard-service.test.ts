import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  approvals,
  companies,
  createDb,
  documents,
  heartbeatRuns,
  issueApprovals,
  issueDocuments,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { dashboardService, getUtcMonthStart } from "../services/dashboard.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres dashboard service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function utcDay(offsetDays: number): Date {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, 12);
  return new Date(day);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("getUtcMonthStart", () => {
  it("anchors the monthly spend window to UTC month boundaries", () => {
    expect(getUtcMonthStart(new Date("2026-03-31T20:30:00.000-05:00")).toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    expect(getUtcMonthStart(new Date("2026-04-01T00:30:00.000+14:00")).toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });
});

describeEmbeddedPostgres("dashboard service", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-dashboard-service-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueDocuments);
    await db.delete(documents);
    await db.delete(issueApprovals);
    await db.delete(approvals);
    await db.delete(heartbeatRuns);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("aggregates the full 14-day run activity window without recent-run truncation", async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const agentId = randomUUID();
    const otherAgentId = randomUUID();
    const today = utcDay(0);
    const weekAgo = utcDay(-7);

    await db.insert(companies).values([
      {
        id: companyId,
        name: "Paperclip",
        issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      },
      {
        id: otherCompanyId,
        name: "Other",
        issuePrefix: `T${otherCompanyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        requireBoardApprovalForNewAgents: false,
      },
    ]);

    await db.insert(agents).values([
      {
        id: agentId,
        companyId,
        name: "CodexCoder",
        role: "engineer",
        status: "running",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
      {
        id: otherAgentId,
        companyId: otherCompanyId,
        name: "OtherAgent",
        role: "engineer",
        status: "running",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    ]);

    await db.insert(heartbeatRuns).values([
      ...Array.from({ length: 105 }, () => ({
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "succeeded",
        createdAt: today,
      })),
      {
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "failed",
        createdAt: weekAgo,
      },
      {
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "timed_out",
        createdAt: weekAgo,
      },
      {
        id: randomUUID(),
        companyId,
        agentId,
        invocationSource: "assignment",
        status: "cancelled",
        createdAt: weekAgo,
      },
      {
        id: randomUUID(),
        companyId: otherCompanyId,
        agentId: otherAgentId,
        invocationSource: "assignment",
        status: "succeeded",
        createdAt: weekAgo,
      },
    ]);

    const summary = await dashboardService(db).summary(companyId);

    expect(summary.runActivity).toHaveLength(14);
    const todayBucket = summary.runActivity.find((bucket) => bucket.date === utcDateKey(today));
    const weekAgoBucket = summary.runActivity.find((bucket) => bucket.date === utcDateKey(weekAgo));

    expect(todayBucket).toMatchObject({
      succeeded: 105,
      failed: 0,
      other: 0,
      total: 105,
    });
    expect(weekAgoBucket).toMatchObject({
      succeeded: 0,
      failed: 2,
      other: 1,
      total: 3,
    });
  });

  it("surfaces SubRadar topic documents and pending Top 5 approvals", async () => {
    const companyId = randomUUID();
    const sourceIssueId = randomUUID();
    const selectionIssueId = randomUUID();
    const sourceDocumentId = randomUUID();
    const selectionDocumentId = randomUUID();
    const approvalId = randomUUID();
    const now = new Date();

    await db.insert(companies).values({
      id: companyId,
      name: "AI HUB",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(issues).values([
      {
        id: sourceIssueId,
        companyId,
        title: "SubRadar source intake",
        identifier: "AIH-5",
        status: "done",
      },
      {
        id: selectionIssueId,
        companyId,
        title: "Top 5 topic selection",
        identifier: "AIH-6",
        status: "in_review",
        parentId: sourceIssueId,
      },
    ]);
    await db.insert(documents).values([
      {
        id: sourceDocumentId,
        companyId,
        title: "SubRadar source list",
        latestBody: "20 source videos from SubRadar",
        updatedAt: now,
      },
      {
        id: selectionDocumentId,
        companyId,
        title: "Top 5 topic decision",
        latestBody: "Top 5 selected from SubRadar",
        updatedAt: new Date(now.getTime() + 1000),
      },
    ]);
    await db.insert(issueDocuments).values([
      {
        companyId,
        issueId: sourceIssueId,
        documentId: sourceDocumentId,
        key: "subradar-source-list",
      },
      {
        companyId,
        issueId: selectionIssueId,
        documentId: selectionDocumentId,
        key: "top5-decision",
      },
    ]);
    await db.insert(approvals).values([
      {
        id: approvalId,
        companyId,
        type: "request_board_approval",
        status: "pending",
        payload: {
          kind: "content_topic_selection",
          title: "Approve Top 5 AIwBiznesie topics",
          summary: "Chosen only from SubRadar source videos.",
          topics: [
            {
              rank: 1,
              source_title: "ChatGPT Images Just Got Way Better (Here's Why)",
              source_url: "https://example.com/video-12",
              business_angle: "Small business marketing assets and product mockups.",
            },
            "Automating customer support",
          ],
        },
      },
      {
        companyId,
        type: "request_board_approval",
        status: "pending",
        payload: { title: "Unrelated board approval" },
      },
    ]);
    await db.insert(issueApprovals).values({
      companyId,
      issueId: selectionIssueId,
      approvalId,
    });

    const summary = await dashboardService(db).summary(companyId);

    expect(summary.contentTopics.sourceBatches).toBe(1);
    expect(summary.contentTopics.selectionDocuments).toBe(1);
    expect(summary.contentTopics.pendingApprovals).toBe(1);
    expect(summary.contentTopics.latestSourceBatch).toMatchObject({
      issueIdentifier: "AIH-5",
      documentKey: "subradar-source-list",
    });
    expect(summary.contentTopics.latestSelection).toMatchObject({
      issueIdentifier: "AIH-6",
      documentKey: "top5-decision",
    });
    expect(summary.contentTopics.pendingSelection).toMatchObject({
      id: approvalId,
      title: "Approve Top 5 AIwBiznesie topics",
      issueId: selectionIssueId,
      issueIdentifier: "AIH-6",
    });
    expect(summary.contentTopics.pendingSelection?.topics).toEqual([
      {
        rank: 1,
        title: "ChatGPT Images Just Got Way Better (Here's Why)",
        summary: "Small business marketing assets and product mockups.",
        sourceTitle: "ChatGPT Images Just Got Way Better (Here's Why)",
        sourceUrl: "https://example.com/video-12",
      },
      {
        rank: 2,
        title: "Automating customer support",
        summary: null,
        sourceTitle: null,
        sourceUrl: null,
      },
    ]);
  });
});
