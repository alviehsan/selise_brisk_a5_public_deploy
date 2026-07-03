import type { ChartKind, ChartSuitability, DatasetProfile, DatasetRow } from "./briskTypes";

export interface ChartSuitabilityRequest {
  kind: ChartKind;
  profile: DatasetProfile;
  rows: DatasetRow[];
}

const trendKinds: ChartKind[] = ["line", "area", "column"];
const comparisonKinds: ChartKind[] = ["bar", "stacked-bar", "stacked-column", "heatmap"];
const compositionKinds: ChartKind[] = ["pie", "doughnut", "treemap", "funnel"];
const relationshipKinds: ChartKind[] = ["scatter", "bubble"];
const progressKinds: ChartKind[] = ["kpi", "gauge", "bullet"];

export function scoreChartSuitability({ kind, profile, rows }: ChartSuitabilityRequest): ChartSuitability {
  const dimensionValues = uniqueValues(rows, profile.primaryDimension);
  const metricCount = profile.columns.filter((column) => column.role === "metric" && column.type === "numeric").length;

  if (trendKinds.includes(kind)) {
    if (!profile.dateField) return blocked(kind, "Trend charts need a date field.", ["date"]);
    if (!profile.revenueField) return blocked(kind, "Trend charts need a numeric metric.", ["metric"]);
    if (rows.length < 2) return warning(kind, "Trend charts are weak with fewer than two rows.", ["date", "metric"], 62);
    return recommended(kind, `${profile.dateField} creates a period series for ${profile.revenueField}.`, ["date", "metric"], kind === "line" ? 92 : 86);
  }

  if (comparisonKinds.includes(kind)) {
    if (!profile.primaryDimension) return blocked(kind, "Comparison charts need a dimension.", ["dimension"]);
    if (!profile.revenueField) return blocked(kind, "Comparison charts need a numeric metric.", ["metric"]);
    if (dimensionValues.length < 2) return warning(kind, "Comparison charts are more useful with at least two categories.", ["dimension", "metric"], 66);
    return recommended(kind, `${profile.primaryDimension} has ${dimensionValues.length} categories for comparison.`, ["dimension", "metric"], 88);
  }

  if (compositionKinds.includes(kind)) {
    if (!profile.primaryDimension) return blocked(kind, "Composition charts need a category field.", ["dimension"]);
    if (!profile.revenueField) return blocked(kind, "Composition charts need a numeric metric.", ["metric"]);
    if (dimensionValues.length < 2) return blocked(kind, "Composition charts need at least two parts.", ["dimension", "metric"]);
    if (dimensionValues.length > 8 && (kind === "pie" || kind === "doughnut")) {
      return warning(kind, "Pie and doughnut charts become hard to read with many categories.", ["dimension", "metric"], 58);
    }
    return recommended(kind, `${profile.primaryDimension} can show share of ${profile.revenueField}.`, ["dimension", "metric"], kind === "treemap" ? 84 : 80);
  }

  if (relationshipKinds.includes(kind)) {
    if (metricCount < 2) return blocked(kind, "Relationship charts need two numeric measures.", ["metric", "metric"]);
    if (rows.length < 3) return warning(kind, "Relationship charts are weak with fewer than three points.", ["metric", "metric"], 60);
    return recommended(kind, "Revenue and profit-like measures can show relationship patterns.", ["metric", "metric"], 82);
  }

  if (progressKinds.includes(kind)) {
    if (!profile.revenueField) return blocked(kind, "Progress charts need a primary metric.", ["metric"]);
    if ((kind === "gauge" || kind === "bullet") && !profile.profitField && !profile.targetField) {
      return warning(kind, "Gauge and bullet charts work best with profit, target, or benchmark context.", ["metric"], 64);
    }
    return recommended(kind, "A primary metric is available for executive progress display.", ["metric"], 78);
  }

  if (kind === "histogram") {
    if (!profile.revenueField) return blocked(kind, "Histogram needs a numeric metric.", ["metric"]);
    if (rows.length < 5) return warning(kind, "Histogram is weak with fewer than five values.", ["metric"], 54);
    return recommended(kind, `${profile.revenueField} can show distribution across records.`, ["metric"], 74);
  }

  if (kind === "choropleth") {
    if (!profile.primaryDimension) return blocked(kind, "Choropleth needs a geography-like dimension.", ["geography"]);
    if (!isGeographyLike(profile.primaryDimension)) {
      return warning(kind, "Choropleth needs geography-like values such as region, market, country, or territory.", ["geography"], 52);
    }
    return recommended(kind, `${profile.primaryDimension} is geography-like and can support mapped performance.`, ["geography"], 76);
  }

  return warning(kind, "This chart type is available but needs visual QA for this dataset.", [], 50);
}

function recommended(kind: ChartKind, reason: string, requiredFields: string[], score: number): ChartSuitability {
  return { kind, score, status: "recommended", reason, requiredFields };
}

function warning(kind: ChartKind, reason: string, requiredFields: string[], score: number): ChartSuitability {
  return { kind, score, status: "warning", reason, requiredFields };
}

function blocked(kind: ChartKind, reason: string, requiredFields: string[]): ChartSuitability {
  return { kind, score: 0, status: "blocked", reason, requiredFields };
}

function uniqueValues(rows: DatasetRow[], field?: string): string[] {
  if (!field) return [];
  return Array.from(new Set(rows.map((row) => String(row[field] ?? "")).filter(Boolean)));
}

function isGeographyLike(fieldName: string): boolean {
  return /(region|market|country|state|city|territory|geo|geography)/i.test(fieldName);
}
