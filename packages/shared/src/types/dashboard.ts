export interface DashboardRunActivityDay {
  date: string;
  succeeded: number;
  failed: number;
  other: number;
  total: number;
}

export interface DashboardContentTopicItem {
  rank: number | null;
  title: string;
  summary: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
}

export interface DashboardContentTopicDocument {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  issueStatus: string;
  documentKey: string;
  documentTitle: string | null;
  updatedAt: Date;
}

export interface DashboardContentTopicApproval {
  id: string;
  status: string;
  title: string;
  summary: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  createdAt: Date;
  updatedAt: Date;
  topics: DashboardContentTopicItem[];
}

export interface DashboardContentTopicsSummary {
  sourceBatches: number;
  selectionDocuments: number;
  pendingApprovals: number;
  latestSourceBatch: DashboardContentTopicDocument | null;
  latestSelection: DashboardContentTopicDocument | null;
  pendingSelection: DashboardContentTopicApproval | null;
}

export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  budgets: {
    activeIncidents: number;
    pendingApprovals: number;
    pausedAgents: number;
    pausedProjects: number;
  };
  contentTopics: DashboardContentTopicsSummary;
  runActivity: DashboardRunActivityDay[];
}
