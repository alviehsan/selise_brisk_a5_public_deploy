export type DatasetRow = Record<string, string | number | boolean | null | undefined>;

export type ColumnType = "numeric" | "date" | "category" | "text" | "unknown";
export type SemanticFieldRole = "metric" | "dimension" | "date" | "identifier" | "target" | "benchmark" | "unknown";

export interface DatasetColumnProfile {
  name: string;
  type: ColumnType;
  missingCount: number;
  uniqueCount: number;
  role: SemanticFieldRole;
}

export interface DatasetDomainProfile {
  name: string;
  confidence: number;
}

export interface DatasetProfile {
  fileName: string;
  rowCount: number;
  columnCount: number;
  domain: DatasetDomainProfile;
  missingFields: string[];
  columns: DatasetColumnProfile[];
  qualityScore: number;
  readinessScore: number;
  dateField?: string;
  revenueField?: string;
  profitField?: string;
  orderField?: string;
  targetField?: string;
  benchmarkField?: string;
  primaryDimension?: string;
}

export interface SemanticFieldOverride {
  fieldName: string;
  role: SemanticFieldRole;
}

export interface SemanticAlias {
  fieldName: string;
  alias: string;
  role: SemanticFieldRole;
  confidence: number;
  reason: string;
  source: "system" | "user";
}

export interface SemanticFormula {
  id: "margin" | "growth-rate" | "variance" | "contribution-share";
  label: string;
  expression: string;
  requiredAliases: string[];
  available: boolean;
  reason: string;
  evidenceFields: string[];
}

export interface SchemaGraphNode {
  id: string;
  label: string;
  kind: "field" | "alias" | "formula";
  role?: SemanticFieldRole;
}

export interface SchemaGraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface SchemaGraph {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
}

export interface SemanticQualityWarning {
  id: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidenceFields: string[];
}

export interface EvidenceReference {
  fieldName: string;
  reason: string;
  source: "name-match" | "type-inference" | "user-override" | "formula";
}

export interface SemanticModel {
  aliases: SemanticAlias[];
  formulas: SemanticFormula[];
  schemaGraph: SchemaGraph;
  warnings: SemanticQualityWarning[];
  evidenceReferences: EvidenceReference[];
}

export interface DashboardRecommendation {
  name: string;
  confidence: number;
  audience: string;
  kpis: string[];
  limitations: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
}

export interface ValidatedAction {
  status: "passed" | "failed";
  action: "add_chart" | "needs_review";
  title: string;
  checks: ValidationCheck[];
}

export type ConsultantActionType =
  | "add_chart"
  | "remove_chart"
  | "resize_chart"
  | "rename_dashboard"
  | "create_tab"
  | "explain_insight"
  | "export_summary";

export interface ConsultantAction {
  id: string;
  type: ConsultantActionType;
  title: string;
  description: string;
  status: "passed" | "failed";
  payload: Record<string, string | number | boolean>;
  checks: ValidationCheck[];
  evidence: EvidenceReference[];
}

export interface ConsultantResponse {
  answer: string;
  confidence: "high" | "medium" | "low";
  caveats: string[];
  evidence: EvidenceReference[];
  proposedActions: ConsultantAction[];
}

export interface DashboardPackage {
  format: string;
  version: string;
  permissions: {
    hideRawData: boolean;
  };
  includes: string[];
}

export interface PrivacySettings {
  hideRawData: boolean;
  maskSensitiveFields: boolean;
  includeAiPrompts: boolean;
  includeEvidencePackage: boolean;
}

export interface AiAuditEvent {
  id: string;
  timestamp: string;
  question: string;
  providerLabel: string;
  model: string;
  actionTitle: string;
  status: "answered" | "proposed" | "applied" | "dismissed" | "blocked";
  evidenceFields: string[];
}

export interface EvidenceSourceRow {
  rowIndex: number;
  values: Record<string, string | number | boolean | null>;
}

export interface EvidenceSubject {
  id: DashboardInsightKey | "profile" | "ai-answer" | "export";
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  sourceFields: string[];
  formulaLabels: string[];
  assumptions: string[];
  rowPreview: EvidenceSourceRow[];
}

export interface EvidencePackage {
  generatedAt: string;
  sourceFile: string;
  subjects: EvidenceSubject[];
  formulas: SemanticFormula[];
  assumptions: string[];
  rowPreview: EvidenceSourceRow[];
  auditTrail: AiAuditEvent[];
  privacySettings: PrivacySettings;
}

export interface DashboardKpi {
  label: string;
  value: string;
  tone?: "good" | "warning" | "neutral";
  sourceFields: string[];
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ComparisonPoint {
  label: string;
  primary: number;
  secondary: number;
}

export interface DriverMatrixRow {
  label: string;
  revenue: number;
  profit: number;
  orders: number;
  margin: number;
}

export interface GrowthSummary {
  currentPeriod: string;
  previousPeriod: string;
  changePercent: number;
  direction: "up" | "down" | "flat";
}

export type ChartKind =
  | "line"
  | "area"
  | "column"
  | "bar"
  | "stacked-bar"
  | "stacked-column"
  | "pie"
  | "doughnut"
  | "treemap"
  | "kpi"
  | "gauge"
  | "bullet"
  | "scatter"
  | "histogram"
  | "bubble"
  | "funnel"
  | "heatmap"
  | "choropleth";

export type ChartSize = "small" | "medium" | "wide" | "tall" | "full";

export interface ChartSpec {
  id: string;
  title: string;
  kind: ChartKind;
  size: ChartSize;
  reason: string;
}

export interface ChartSuitability {
  kind: ChartKind;
  score: number;
  status: "recommended" | "warning" | "blocked";
  reason: string;
  requiredFields: string[];
}

export type DashboardInsightKey =
  | "growth"
  | "regional"
  | "revenueProfit"
  | "productMix"
  | "margin"
  | "matrix"
  | "distribution"
  | "scatter";

export interface DashboardInsight {
  title: string;
  takeaway: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  evidenceLabels: string[];
}

export interface DashboardModel {
  title: string;
  kpis: DashboardKpi[];
  trend: ChartPoint[];
  growthSummary?: GrowthSummary;
  profitTrend: ChartPoint[];
  revenueVsProfit: ComparisonPoint[];
  driverBreakdown: ChartPoint[];
  marginByDimension: ChartPoint[];
  productMix: ChartPoint[];
  driverMatrix: DriverMatrixRow[];
  recommendedCharts: ChartSpec[];
  insights: Record<DashboardInsightKey, DashboardInsight>;
  risks: string[];
  opportunities: string[];
  summary: string[];
  evidence: Array<{ label: string; value: string }>;
}
