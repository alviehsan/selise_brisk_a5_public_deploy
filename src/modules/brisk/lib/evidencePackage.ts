import type {
  AiAuditEvent,
  DashboardInsight,
  DashboardInsightKey,
  DashboardModel,
  DatasetProfile,
  DatasetRow,
  EvidencePackage,
  EvidenceSourceRow,
  EvidenceSubject,
  PrivacySettings,
  SemanticModel
} from "./briskTypes";

export interface EvidencePackageRequest {
  profile: DatasetProfile;
  dashboard: DashboardModel;
  semanticModel: SemanticModel;
  rows: DatasetRow[];
  auditTrail: AiAuditEvent[];
  privacySettings: PrivacySettings;
}

const insightOrder: DashboardInsightKey[] = [
  "growth",
  "regional",
  "revenueProfit",
  "productMix",
  "margin",
  "matrix",
  "distribution",
  "scatter"
];

export const defaultPrivacySettings: PrivacySettings = {
  hideRawData: true,
  maskSensitiveFields: false,
  includeAiPrompts: true,
  includeEvidencePackage: true
};

export function createEvidencePackage({
  profile,
  dashboard,
  semanticModel,
  rows,
  auditTrail,
  privacySettings
}: EvidencePackageRequest): EvidencePackage {
  const rowPreview = createRowPreview(rows, privacySettings);
  const assumptions = [
    `Dashboard uses uploaded ${profile.fileName} only.`,
    "Detected semantic roles can be corrected by the user.",
    "No source data is changed by dashboard or AI actions.",
    privacySettings.hideRawData ? "Raw row values are hidden in shared evidence previews." : "Raw row values may be shown in evidence previews."
  ];
  const formulas = semanticModel.formulas.filter((formula) => formula.available);

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: profile.fileName,
    subjects: insightOrder.map((id) => createSubject(id, dashboard.insights[id], formulas, assumptions, rowPreview)),
    formulas,
    assumptions,
    rowPreview,
    auditTrail: auditTrail.map((event) => ({
      ...event,
      question: privacySettings.includeAiPrompts ? event.question : "Hidden by privacy controls"
    })),
    privacySettings
  };
}

function createSubject(
  id: DashboardInsightKey,
  insight: DashboardInsight,
  formulas: EvidencePackage["formulas"],
  assumptions: string[],
  rowPreview: EvidenceSourceRow[]
): EvidenceSubject {
  return {
    id,
    title: insight.title,
    summary: `${insight.takeaway} ${insight.detail}`,
    confidence: insight.confidence,
    sourceFields: insight.evidenceLabels,
    formulaLabels: formulas
      .filter((formula) => formula.evidenceFields.some((field) => insight.evidenceLabels.includes(field)))
      .map((formula) => formula.label),
    assumptions: assumptions.slice(0, 3),
    rowPreview
  };
}

function createRowPreview(rows: DatasetRow[], privacySettings: PrivacySettings): EvidenceSourceRow[] {
  return rows.slice(0, 3).map((row, index) => ({
    rowIndex: index + 1,
    values: Object.fromEntries(
      Object.entries(row).slice(0, 8).map(([field, value]) => [field, maskValue(field, value, privacySettings)])
    )
  }));
}

function maskValue(
  field: string,
  value: DatasetRow[string],
  privacySettings: PrivacySettings
): string | number | boolean | null {
  if (value === undefined) return null;
  if (privacySettings.maskSensitiveFields && isSensitiveField(field)) return "Masked";
  if (privacySettings.hideRawData && typeof value === "number") return "Hidden";
  return value ?? null;
}

function isSensitiveField(field: string): boolean {
  return /customer|client|email|phone|name|account|id/i.test(field);
}
