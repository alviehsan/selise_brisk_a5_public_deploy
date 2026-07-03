import type {
  ColumnType,
  DatasetColumnProfile,
  DatasetDomainProfile,
  DatasetProfile,
  DatasetRow,
  SemanticFieldOverride,
  SemanticFieldRole
} from "./briskTypes";
import { findField } from "./briskUtils";

const REQUIRED_SALES_FIELDS = [
  "Order Date",
  "Region",
  "Product",
  "Sales Amount",
  "Gross Profit",
  "Orders",
  "Customer",
  "Sales Target"
] as const;

const SALES_DOMAIN: DatasetDomainProfile = {
  name: "Sales / Revenue",
  confidence: 94
};

const OPERATIONS_DOMAIN: DatasetDomainProfile = {
  name: "Operations / Performance",
  confidence: 82
};

export interface AnalyzeDatasetOptions {
  semanticOverrides?: SemanticFieldOverride[];
}

export function analyzeDataset(
  rows: DatasetRow[],
  fileName = "Sales_Data_Q2.xlsx",
  options: AnalyzeDatasetOptions = {}
): DatasetProfile {
  const columns = inferColumns(rows, options.semanticOverrides ?? []);
  const fieldNames = columns.map((column) => column.name);
  const missingFields = REQUIRED_SALES_FIELDS.filter((field) => !fieldNames.includes(field));
  const revenueField = findMetricField(columns, ["sales amount", "net sales", "revenue", "sales", "amount"]);
  const profitField = findMetricField(columns, ["gross profit", "profit", "margin"]);
  const orderField = findMetricField(columns, ["orders", "order count", "quantity", "units"]);
  const targetField = findSemanticField(columns, "target", ["sales target", "target", "quota", "goal", "budget"]);
  const benchmarkField = findSemanticField(columns, "benchmark", ["benchmark", "last year", "prior", "baseline", "plan"]);
  const dateField = columns.find((column) => column.role === "date")?.name;
  const overrideDimension = options.semanticOverrides?.find((override) => override.role === "dimension")?.fieldName;
  const dimensionFieldNames = columns.filter((column) => column.role === "dimension").map((column) => column.name);
  const primaryDimension =
    (overrideDimension && fieldNames.includes(overrideDimension) ? overrideDimension : undefined) ??
    findField(dimensionFieldNames, ["region", "market", "country", "segment", "product", "category", "customer"]) ??
    columns.find((column) => column.role === "dimension")?.name;
  const totalCells = Math.max(rows.length * Math.max(columns.length, 1), 1);
  const missingCells = columns.reduce((sum, column) => sum + column.missingCount, 0);
  const qualityScore = Math.max(0, Math.round(100 - (missingCells / totalCells) * 100));
  const readinessScore = Math.min(
    98,
    Math.max(40, 52 + (revenueField ? 16 : 0) + (dateField ? 12 : 0) + (primaryDimension ? 10 : 0) + (profitField ? 8 : 0))
  );

  return {
    fileName,
    rowCount: rows.length,
    columnCount: columns.length,
    domain: detectDomain(fieldNames),
    missingFields: [...missingFields],
    columns,
    qualityScore,
    readinessScore,
    dateField,
    revenueField,
    profitField,
    orderField,
    targetField,
    benchmarkField,
    primaryDimension
  };
}

function inferColumns(rows: DatasetRow[], semanticOverrides: SemanticFieldOverride[]): DatasetColumnProfile[] {
  const names = new Set<string>();
  const overridesByField = new Map(semanticOverrides.map((override) => [override.fieldName, override.role]));

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      names.add(key);
    }
  }

  return Array.from(names).map((name) => {
    const values = rows.map((row) => row[name]);
    const type = inferColumnType(rows, name);
    return {
      name,
      type,
      missingCount: values.filter((value) => value === null || value === undefined || value === "").length,
      uniqueCount: new Set(values.filter((value) => value !== null && value !== undefined && value !== "")).size,
      role: overridesByField.get(name) ?? inferRole(name, type)
    };
  });
}

function inferColumnType(rows: DatasetRow[], columnName: string): ColumnType {
  let hasValue = false;
  let numericCount = 0;
  let textCount = 0;

  for (const row of rows) {
    const value = row[columnName];

    if (value === null || value === undefined || value === "") {
      continue;
    }

    hasValue = true;

    if (typeof value === "number" && Number.isFinite(value)) {
      numericCount += 1;
      continue;
    }

    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      numericCount += 1;
      continue;
    }

    textCount += 1;
  }

  if (!hasValue) {
    return "unknown";
  }

  if (looksLikeDateColumn(columnName, rows)) {
    return "date";
  }

  if (numericCount > 0 && textCount === 0) {
    return "numeric";
  }

  return textCount > 0 && rows.length > 0 && textCount <= rows.length ? "category" : "text";
}

function detectDomain(fields: string[]): DatasetDomainProfile {
  const haystack = fields.join(" ").toLowerCase();

  if (/(sales|revenue|order|customer|profit|region|product)/.test(haystack)) {
    return SALES_DOMAIN;
  }

  return OPERATIONS_DOMAIN;
}

function findMetricField(columns: DatasetColumnProfile[], candidates: string[]): string | undefined {
  const matches = columns
    .filter((column) => column.role === "metric" && column.type === "numeric")
    .map((column) => ({
      column,
      score: scoreFieldName(column.name, candidates)
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.column.name.localeCompare(b.column.name));

  return matches[0]?.column.name;
}

function findSemanticField(columns: DatasetColumnProfile[], role: SemanticFieldRole, candidates: string[]): string | undefined {
  return columns.find((column) => column.role === role)?.name ??
    columns
      .map((column) => ({
        column,
        score: scoreFieldName(column.name, candidates)
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || a.column.name.localeCompare(b.column.name))[0]?.column.name;
}

function scoreFieldName(field: string, candidates: string[]): number {
  const normalized = normalizeFieldName(field);
  const tokens = normalized.split(" ").filter(Boolean);
  let score = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeFieldName(candidate);
    if (normalized === normalizedCandidate) score = Math.max(score, 100);
    if (tokens.includes(normalizedCandidate)) score = Math.max(score, 80);
    if (normalized.includes(normalizedCandidate) && normalizedCandidate.length > 3) score = Math.max(score, 40);
  }

  return score;
}

function normalizeFieldName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function inferRole(name: string, type: ColumnType): DatasetColumnProfile["role"] {
  const lower = name.toLowerCase();
  if (type === "date" || lower.includes("date") || lower.includes("month")) return "date";
  if (/(target|quota|goal|budget)/.test(lower)) return "target";
  if (/(benchmark|baseline|prior|last year|plan)/.test(lower)) return "benchmark";
  if (lower.includes("id")) return "identifier";
  if (type === "numeric") return "metric";
  if (type === "category" || type === "text") return "dimension";
  return "unknown";
}

function looksLikeDateColumn(name: string, rows: DatasetRow[]): boolean {
  if (/(date|month|period|year)/i.test(name)) return true;
  const sample = rows.map((row) => row[name]).find(Boolean);
  return typeof sample === "string" && !Number.isFinite(Number(sample)) && Number.isFinite(Date.parse(sample));
}
