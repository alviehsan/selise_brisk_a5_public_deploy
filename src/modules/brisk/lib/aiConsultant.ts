import type {
  ConsultantAction,
  ConsultantResponse,
  DashboardModel,
  DatasetProfile,
  EvidenceReference,
  SemanticModel,
  ValidationCheck
} from "./briskTypes";

export interface ConsultantRequest {
  question: string;
  profile: DatasetProfile;
  dashboard: DashboardModel;
  semanticModel: SemanticModel;
}

const knownBusinessTerms = [
  "revenue",
  "sales",
  "profit",
  "margin",
  "region",
  "product",
  "customer",
  "orders",
  "target",
  "benchmark",
  "month",
  "date"
];

export function createConsultantResponse({
  question,
  profile,
  dashboard,
  semanticModel
}: ConsultantRequest): ConsultantResponse {
  const normalizedQuestion = question.toLowerCase();
  const evidence = bindEvidence(normalizedQuestion, profile, semanticModel);
  const unsupportedTerms = findUnsupportedBusinessTerms(normalizedQuestion, semanticModel);
  const proposedActions = createActions(normalizedQuestion, question, profile, semanticModel, unsupportedTerms);
  const topDriver = dashboard.driverBreakdown[0];
  const growth = dashboard.growthSummary;
  const confidence = unsupportedTerms.length ? "low" : evidence.length >= 1 ? "medium" : "low";
  const answer = createAnswer(normalizedQuestion, profile, dashboard);
  const caveats = [
    `Answer uses uploaded ${profile.fileName} only.`,
    ...(growth ? [`Latest growth is ${growth.direction} ${Math.abs(growth.changePercent)}% from ${growth.previousPeriod} to ${growth.currentPeriod}.`] : []),
    ...(topDriver ? [`Top detected driver is ${topDriver.label}.`] : []),
    ...unsupportedTerms.map((term) => `I could not find a field or alias for "${term}", so I blocked actions that depend on it.`)
  ];

  return {
    answer,
    confidence,
    caveats,
    evidence,
    proposedActions
  };
}

function createAnswer(question: string, profile: DatasetProfile, dashboard: DashboardModel): string {
  const topDriver = dashboard.driverBreakdown[0];
  const revenue = dashboard.kpis.find((kpi) => kpi.label === "Revenue")?.value ?? "n/a";
  const margin = dashboard.kpis.find((kpi) => kpi.label === "Gross Margin")?.value ?? "n/a";
  const growth = dashboard.growthSummary;

  if (question.includes("why") || question.includes("drop") || question.includes("declin")) {
    return growth
      ? `Revenue is ${growth.direction} ${Math.abs(growth.changePercent)}% in ${growth.currentPeriod}. ${topDriver?.label ?? "The leading segment"} is the strongest available driver in ${profile.primaryDimension ?? "the primary dimension"}.`
      : `Revenue totals ${revenue}. Add or correct a date field to unlock period-over-period driver analysis.`;
  }

  if (question.includes("margin") || question.includes("profit")) {
    return `Gross margin is ${margin}. Brisk used ${profile.profitField ?? "profit"} and ${profile.revenueField ?? "revenue"} to support the margin analysis.`;
  }

  if (question.includes("strong") || question.includes("top") || question.includes("best")) {
    return `${topDriver?.label ?? "The top segment"} is strongest, with ${Math.round(topDriver?.value ?? 0).toLocaleString()} in ${profile.revenueField ?? "the primary metric"}.`;
  }

  if (question.includes("export")) {
    return `I can prepare an export summary using the current dashboard, evidence references, and caveats.`;
  }

  return `I reviewed ${profile.rowCount.toLocaleString()} rows. Revenue is ${revenue}, gross margin is ${margin}, and ${topDriver?.label ?? "the top segment"} is the leading visible driver.`;
}

function createActions(
  normalizedQuestion: string,
  originalQuestion: string,
  profile: DatasetProfile,
  semanticModel: SemanticModel,
  unsupportedTerms: string[]
): ConsultantAction[] {
  const actions: ConsultantAction[] = [];

  if (normalizedQuestion.includes("rename")) {
    const name = extractRenameTarget(originalQuestion);
    actions.push(makeAction("rename_dashboard", "Rename Dashboard", "Rename the current dashboard.", { name }, profile, semanticModel, unsupportedTerms));
  }

  if (normalizedQuestion.includes("create") && (normalizedQuestion.includes("tab") || normalizedQuestion.includes("view"))) {
    actions.push(makeAction("create_tab", "Create Consultant View", "Create a new dashboard tab for the requested analysis.", {
      tabId: `view-${Date.now()}`,
      label: extractTabLabel(originalQuestion)
    }, profile, semanticModel, unsupportedTerms));
  }

  if (normalizedQuestion.includes("remove") || normalizedQuestion.includes("delete")) {
    actions.push(makeAction("remove_chart", "Remove Chart", "Remove the requested dashboard card.", {
      widgetId: inferWidgetId(normalizedQuestion)
    }, profile, semanticModel, unsupportedTerms));
  }

  if (normalizedQuestion.includes("resize") || normalizedQuestion.includes("autofit") || normalizedQuestion.includes("fit")) {
    actions.push(makeAction("resize_chart", "Autofit Dashboard", "Turn on autofit so cards use available space.", {
      mode: "autofit"
    }, profile, semanticModel, unsupportedTerms));
  }

  if (normalizedQuestion.includes("export")) {
    actions.push(makeAction("export_summary", "Prepare Export Summary", "Open exports with an AI-written summary ready.", {
      format: "Share Link"
    }, profile, semanticModel, unsupportedTerms));
  }

  if (normalizedQuestion.includes("explain") || normalizedQuestion.includes("why")) {
    actions.push(makeAction("explain_insight", "Explain Insight", "Attach evidence and caveats to this answer.", {
      insight: normalizedQuestion.includes("margin") ? "margin" : "growth"
    }, profile, semanticModel, unsupportedTerms));
  }

  if (normalizedQuestion.includes("add") || normalizedQuestion.includes("chart") || normalizedQuestion.includes("view")) {
    actions.push(makeAction("add_chart", inferChartTitle(normalizedQuestion), "Add a validated dashboard card.", {
      widgetId: inferWidgetId(normalizedQuestion)
    }, profile, semanticModel, unsupportedTerms));
  }

  return actions.slice(0, 2);
}

function makeAction(
  type: ConsultantAction["type"],
  title: string,
  description: string,
  payload: ConsultantAction["payload"],
  profile: DatasetProfile,
  semanticModel: SemanticModel,
  unsupportedTerms: string[]
): ConsultantAction {
  const checks = validateAction(type, payload, profile, semanticModel, unsupportedTerms);
  const evidence = bindEvidence(JSON.stringify(payload), profile, semanticModel);

  return {
    id: `${type}-${Object.values(payload).join("-") || "action"}`,
    type,
    title,
    description,
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    payload,
    checks,
    evidence
  };
}

function validateAction(
  type: ConsultantAction["type"],
  payload: ConsultantAction["payload"],
  profile: DatasetProfile,
  semanticModel: SemanticModel,
  unsupportedTerms: string[]
): ValidationCheck[] {
  const checks: ValidationCheck[] = [
    { name: "revenue field exists", passed: Boolean(profile.revenueField) },
    { name: "semantic model available", passed: semanticModel.aliases.length > 0 },
    { name: "no hallucinated fields", passed: unsupportedTerms.length === 0 }
  ];

  if (type === "add_chart") {
    checks.push({ name: "dimension field exists", passed: Boolean(profile.primaryDimension) });
    checks.push({ name: "widget is supported", passed: typeof payload.widgetId === "string" && payload.widgetId.length > 0 });
  }

  if (type === "rename_dashboard") {
    checks.push({ name: "new name provided", passed: typeof payload.name === "string" && payload.name.trim().length > 2 });
  }

  if (type === "remove_chart") {
    checks.push({ name: "chart target provided", passed: typeof payload.widgetId === "string" && payload.widgetId.length > 0 });
  }

  return checks;
}

function bindEvidence(question: string, profile: DatasetProfile, semanticModel: SemanticModel): EvidenceReference[] {
  const aliases = semanticModel.aliases.filter((alias) => {
    const aliasKey = alias.alias.toLowerCase();
    const fieldKey = alias.fieldName.toLowerCase();
    return question.includes(aliasKey) || question.includes(fieldKey) || alias.fieldName === profile.revenueField;
  });

  return aliases.slice(0, 4).map((alias) => ({
    fieldName: alias.fieldName,
    reason: `${alias.fieldName} supports the ${alias.alias} concept used by this response.`,
    source: alias.source === "user" ? "user-override" : "name-match"
  }));
}

function findUnsupportedBusinessTerms(question: string, semanticModel: SemanticModel): string[] {
  const knownAliases = new Set([
    ...knownBusinessTerms,
    ...semanticModel.aliases.map((alias) => alias.alias.toLowerCase()),
    ...semanticModel.aliases.map((alias) => alias.fieldName.toLowerCase())
  ]);
  return ["churn", "renewal", "pipeline", "inventory", "refund"]
    .filter((term) => question.includes(term) && !knownAliases.has(term));
}

function inferWidgetId(question: string): string {
  if (question.includes("doughnut") || question.includes("donut") || question.includes("product")) return "aiProductDoughnut";
  if (question.includes("region") || question.includes("regional")) return "regionalComparison";
  if (question.includes("risk")) return "risks";
  if (question.includes("opportunit")) return "opportunities";
  if (question.includes("margin")) return "margin";
  if (question.includes("scatter")) return "revenueProfitScatter";
  if (question.includes("trend") || question.includes("growth")) return "growth";
  return question.includes("churn") || question.includes("renewal") ? "unsupported" : "regionalComparison";
}

function inferChartTitle(question: string): string {
  if (question.includes("doughnut") || question.includes("donut") || question.includes("product")) return "Add Product Mix Doughnut";
  if (question.includes("margin")) return "Add Margin View";
  if (question.includes("trend") || question.includes("growth")) return "Add Growth View";
  return "Add Regional Comparison";
}

function extractRenameTarget(question: string): string {
  const match = question.match(/rename (?:the )?dashboard to (.+)$/i);
  return match?.[1]?.trim() || "Executive Dashboard";
}

function extractTabLabel(question: string): string {
  const match = question.match(/(?:tab|view) (?:for|called|named)?\s*(.+)$/i);
  const label = match?.[1]?.trim();
  return label ? titleCase(label) : "Consultant View";
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
