import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  approvals,
  companies,
  costEvents,
  documents,
  heartbeatRuns,
  issueApprovals,
  issueDocuments,
  issues,
} from "@paperclipai/db";
import { notFound } from "../errors.js";
import { budgetService } from "./budgets.js";

const DASHBOARD_RUN_ACTIVITY_DAYS = 14;
const CONTENT_TOPIC_SOURCE_DOCUMENT_KEYS = [
  "subradar-source-list",
  "subradar-sources",
  "source-list",
] as const;
const CONTENT_TOPIC_SELECTION_DOCUMENT_KEYS = [
  "top5-decision",
  "top5-topics",
  "topic-selection",
] as const;
const CONTENT_TOPIC_DOCUMENT_KEYS = [
  ...CONTENT_TOPIC_SOURCE_DOCUMENT_KEYS,
  ...CONTENT_TOPIC_SELECTION_DOCUMENT_KEYS,
] as const;
const CONTENT_TOPIC_APPROVAL_KIND = "content_topic_selection";

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getRecentUtcDateKeys(now: Date, days: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => {
    const dayOffset = index - (days - 1);
    return formatUtcDateKey(new Date(todayUtc + dayOffset * 24 * 60 * 60 * 1000));
  });
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function topicArrayFromPayload(payload: Record<string, unknown>) {
  const value =
    payload.topics ??
    payload.top5 ??
    payload.selectedTopics ??
    payload.recommendations;
  return Array.isArray(value) ? value : [];
}

function isContentTopicApproval(payload: Record<string, unknown>) {
  const kind = firstText(payload.kind, payload.approvalKind, payload.workflow, payload.topicFlow);
  const source = firstText(payload.source, payload.sourceSystem, payload.sourceName);
  return (
    kind === CONTENT_TOPIC_APPROVAL_KIND ||
    kind === "subradar_topic_selection" ||
    source?.toLowerCase() === "subradar" ||
    topicArrayFromPayload(payload).length > 0 ||
    payload.contentTopics === true
  );
}

function topicItemsFromPayload(payload: Record<string, unknown>) {
  return topicArrayFromPayload(payload)
    .map((item, index) => {
      if (typeof item === "string") {
        const title = cleanText(item);
        return title
          ? {
              rank: index + 1,
              title,
              summary: null,
              sourceTitle: null,
              sourceUrl: null,
            }
          : null;
      }
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const title = firstText(
        raw.title,
        raw.topic,
        raw.name,
        raw.sourceTitle,
        raw.source_title,
        raw.videoTitle,
        raw.video_title,
      );
      if (!title) return null;
      return {
        rank: numberOrNull(raw.rank) ?? numberOrNull(raw.position) ?? index + 1,
        title,
        summary: firstText(raw.summary, raw.businessAngle, raw.business_angle, raw.angle, raw.reason),
        sourceTitle: firstText(
          raw.sourceTitle,
          raw.source_title,
          raw.sourceName,
          raw.source_name,
          raw.videoTitle,
          raw.video_title,
          raw.source,
        ),
        sourceUrl: firstText(raw.sourceUrl, raw.source_url, raw.url, raw.link),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 5);
}

export function dashboardService(db: Db) {
  const budgets = budgetService(db);
  return {
    summary: async (companyId: string) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const agentRows = await db
        .select({ status: agents.status, count: sql<number>`count(*)` })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .groupBy(agents.status);

      const taskRows = await db
        .select({ status: issues.status, count: sql<number>`count(*)` })
        .from(issues)
        .where(eq(issues.companyId, companyId))
        .groupBy(issues.status);

      const pendingApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
        .then((rows) => Number(rows[0]?.count ?? 0));

      const agentCounts: Record<string, number> = {
        active: 0,
        running: 0,
        paused: 0,
        error: 0,
      };
      for (const row of agentRows) {
        const count = Number(row.count);
        // "idle" agents are operational — count them as active
        const bucket = row.status === "idle" ? "active" : row.status;
        agentCounts[bucket] = (agentCounts[bucket] ?? 0) + count;
      }

      const taskCounts: Record<string, number> = {
        open: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
      };
      for (const row of taskRows) {
        const count = Number(row.count);
        if (row.status === "in_progress") taskCounts.inProgress += count;
        if (row.status === "blocked") taskCounts.blocked += count;
        if (row.status === "done") taskCounts.done += count;
        if (row.status !== "done" && row.status !== "cancelled") taskCounts.open += count;
      }

      const now = new Date();
      const monthStart = getUtcMonthStart(now);
      const runActivityDays = getRecentUtcDateKeys(now, DASHBOARD_RUN_ACTIVITY_DAYS);
      const runActivityStart = new Date(`${runActivityDays[0]}T00:00:00.000Z`);
      const [{ monthSpend }] = await db
        .select({
          monthSpend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            gte(costEvents.occurredAt, monthStart),
          ),
        );

      const monthSpendCents = Number(monthSpend);
      const runActivityDayExpr = sql<string>`to_char(${heartbeatRuns.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
      const runActivityRows = await db
        .select({
          date: runActivityDayExpr,
          status: heartbeatRuns.status,
          count: sql<number>`count(*)::double precision`,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, runActivityStart),
          ),
        )
        .groupBy(runActivityDayExpr, heartbeatRuns.status);

      const runActivity = new Map(
        runActivityDays.map((date) => [
          date,
          { date, succeeded: 0, failed: 0, other: 0, total: 0 },
        ]),
      );
      for (const row of runActivityRows) {
        const bucket = runActivity.get(row.date);
        if (!bucket) continue;
        const count = Number(row.count);
        if (row.status === "succeeded") bucket.succeeded += count;
        else if (row.status === "failed" || row.status === "timed_out") bucket.failed += count;
        else bucket.other += count;
        bucket.total += count;
      }

      const utilization =
        company.budgetMonthlyCents > 0
          ? (monthSpendCents / company.budgetMonthlyCents) * 100
          : 0;
      const budgetOverview = await budgets.overview(companyId);
      const topicDocumentRows = await db
        .select({
          issueId: issues.id,
          issueIdentifier: issues.identifier,
          issueTitle: issues.title,
          issueStatus: issues.status,
          documentKey: issueDocuments.key,
          documentTitle: documents.title,
          updatedAt: documents.updatedAt,
        })
        .from(issueDocuments)
        .innerJoin(documents, eq(issueDocuments.documentId, documents.id))
        .innerJoin(issues, eq(issueDocuments.issueId, issues.id))
        .where(
          and(
            eq(issueDocuments.companyId, companyId),
            inArray(issueDocuments.key, [...CONTENT_TOPIC_DOCUMENT_KEYS]),
          ),
        )
        .orderBy(desc(documents.updatedAt));
      const activeTopicDocumentRows = topicDocumentRows.filter((row) => row.issueStatus !== "cancelled");
      const sourceDocuments = activeTopicDocumentRows.filter((row) =>
        CONTENT_TOPIC_SOURCE_DOCUMENT_KEYS.includes(
          row.documentKey as (typeof CONTENT_TOPIC_SOURCE_DOCUMENT_KEYS)[number],
        ),
      );
      const selectionDocuments = activeTopicDocumentRows.filter((row) =>
        CONTENT_TOPIC_SELECTION_DOCUMENT_KEYS.includes(
          row.documentKey as (typeof CONTENT_TOPIC_SELECTION_DOCUMENT_KEYS)[number],
        ),
      );
      const approvalRows = await db
        .select({
          id: approvals.id,
          status: approvals.status,
          payload: approvals.payload,
          createdAt: approvals.createdAt,
          updatedAt: approvals.updatedAt,
        })
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            inArray(approvals.status, ["pending", "revision_requested"]),
          ),
        )
        .orderBy(desc(approvals.createdAt));
      const approvalIds = approvalRows.map((approval) => approval.id);
      const linkedApprovalIssueRows = approvalIds.length > 0
        ? await db
            .select({
              approvalId: issueApprovals.approvalId,
              issueId: issues.id,
              issueIdentifier: issues.identifier,
              issueStatus: issues.status,
            })
            .from(issueApprovals)
            .innerJoin(issues, eq(issueApprovals.issueId, issues.id))
            .where(
              and(
                eq(issueApprovals.companyId, companyId),
                inArray(issueApprovals.approvalId, approvalIds),
              ),
            )
            .orderBy(desc(issueApprovals.createdAt))
        : [];
      const linkedIssueByApprovalId = new Map<
        string,
        (typeof linkedApprovalIssueRows)[number]
      >();
      for (const row of linkedApprovalIssueRows) {
        if (row.issueStatus === "cancelled" || linkedIssueByApprovalId.has(row.approvalId)) continue;
        linkedIssueByApprovalId.set(row.approvalId, row);
      }
      const pendingTopicApprovals = approvalRows
        .filter((approval) => isContentTopicApproval(approval.payload))
        .map((approval) => {
          const payload = approval.payload;
          const linkedIssueId = firstText(payload.issueId, payload.linkedIssueId);
          const linkedIssue = linkedIssueId
            ? activeTopicDocumentRows.find((row) => row.issueId === linkedIssueId) ?? null
            : null;
          const relationIssue = linkedIssueByApprovalId.get(approval.id) ?? null;
          return {
            id: approval.id,
            status: approval.status,
            title:
              firstText(payload.title, payload.name, payload.summary, payload.recommendedAction) ??
              "Content topic selection",
            summary: firstText(payload.summary, payload.description),
            issueId: linkedIssue?.issueId ?? linkedIssueId ?? relationIssue?.issueId ?? null,
            issueIdentifier:
              linkedIssue?.issueIdentifier ??
              firstText(payload.issueIdentifier) ??
              relationIssue?.issueIdentifier ??
              null,
            createdAt: approval.createdAt,
            updatedAt: approval.updatedAt,
            topics: topicItemsFromPayload(payload),
          };
        });

      return {
        companyId,
        agents: {
          active: agentCounts.active,
          running: agentCounts.running,
          paused: agentCounts.paused,
          error: agentCounts.error,
        },
        tasks: taskCounts,
        costs: {
          monthSpendCents,
          monthBudgetCents: company.budgetMonthlyCents,
          monthUtilizationPercent: Number(utilization.toFixed(2)),
        },
        pendingApprovals,
        budgets: {
          activeIncidents: budgetOverview.activeIncidents.length,
          pendingApprovals: budgetOverview.pendingApprovalCount,
          pausedAgents: budgetOverview.pausedAgentCount,
          pausedProjects: budgetOverview.pausedProjectCount,
        },
        contentTopics: {
          sourceBatches: sourceDocuments.length,
          selectionDocuments: selectionDocuments.length,
          pendingApprovals: pendingTopicApprovals.length,
          latestSourceBatch: sourceDocuments[0] ?? null,
          latestSelection: selectionDocuments[0] ?? null,
          pendingSelection: pendingTopicApprovals[0] ?? null,
        },
        runActivity: Array.from(runActivity.values()),
      };
    },
  };
}
