import type {
  ChartPoint,
  ChartSpec,
  ComparisonPoint,
  DashboardInsight,
  DashboardInsightKey,
  DashboardModel,
  DatasetProfile,
  DatasetRow,
  DriverMatrixRow,
  GrowthSummary
} from "./briskTypes";
import { compact, findField, formatCurrency, formatNumber, normalizeMonth, roundOne, toNumber } from "./briskUtils";

export function buildDashboard(profile: DatasetProfile, rows: DatasetRow[]): DashboardModel {
  const revenue = sumField(rows, profile.revenueField);
  const profit = sumField(rows, profile.profitField);
  const orders = sumField(rows, profile.orderField);
  const margin = revenue > 0 && profit > 0 ? (profit / revenue) * 100 : 0;
  const trend = profile.dateField
    ? groupByField(rows, profile.dateField, profile.revenueField, (value) => normalizeMonth(value), "label")
    : [];
  const profitTrend = profile.dateField
    ? groupByField(rows, profile.dateField, profile.profitField, (value) => normalizeMonth(value), "label")
    : [];
  const revenueVsProfit = trend.map((point) => ({
    label: point.label,
    primary: point.value,
    secondary: profitTrend.find((profitPoint) => profitPoint.label === point.label)?.value ?? 0
  }));
  const driverBreakdown = profile.primaryDimension
    ? groupByField(rows, profile.primaryDimension, profile.revenueField)
    : [];
  const productField = findField(profile.columns.map((column) => column.name), ["product", "category", "sku", "item"]);
  const productMix = productField ? groupByField(rows, productField, profile.revenueField) : [];
  const marginByDimension = profile.primaryDimension
    ? groupMarginByField(rows, profile.primaryDimension, profile.revenueField, profile.profitField)
    : [];
  const driverMatrix = profile.primaryDimension
    ? buildDriverMatrix(rows, profile.primaryDimension, profile.revenueField, profile.profitField, profile.orderField)
    : [];
  const growthSummary = buildGrowthSummary(trend);
  const recommendedCharts = recommendCharts(profile, {
    trend,
    driverBreakdown,
    productMix,
    revenueVsProfit,
    marginByDimension,
    driverMatrix
  });
  const insights = buildInsights(profile, rows, {
    trend,
    revenueVsProfit,
    driverBreakdown,
    marginByDimension,
    productMix,
    driverMatrix
  });

  return {
    title: profile.domain.name.includes("Sales")
      ? "Executive Sales Performance Dashboard"
      : "Executive Business Performance Dashboard",
    kpis: [
      { label: "Revenue", value: formatCurrency(revenue), sourceFields: compact([profile.revenueField]) },
      {
        label: "Gross Margin",
        value: margin ? `${margin.toFixed(1)}%` : "n/a",
        tone: margin && margin < 30 ? "warning" : "neutral",
        sourceFields: compact([profile.revenueField, profile.profitField])
      },
      { label: "Orders", value: orders ? Math.round(orders).toLocaleString() : String(rows.length), sourceFields: compact([profile.orderField]) },
      { label: "Data Quality", value: `${profile.qualityScore}%`, sourceFields: profile.columns.map((column) => column.name) }
    ],
    trend,
    growthSummary,
    profitTrend,
    revenueVsProfit,
    driverBreakdown,
    marginByDimension,
    productMix,
    driverMatrix,
    recommendedCharts,
    insights,
    risks: createRisks(profile, margin, driverBreakdown),
    opportunities: createOpportunities(profile, driverBreakdown),
    summary: [
      `${profile.domain.name} detected from ${profile.rowCount.toLocaleString()} rows.`,
      profile.revenueField ? `${profile.revenueField} is the primary metric.` : "No clear revenue metric was found.",
      profile.primaryDimension ? `${profile.primaryDimension} is the strongest breakdown dimension.` : "Add a category field for richer driver analysis."
    ],
    evidence: [
      { label: "Source file", value: profile.fileName },
      { label: "Primary metric", value: profile.revenueField ?? "Not detected" },
      { label: "Primary dimension", value: profile.primaryDimension ?? "Not detected" },
      { label: "Assumption", value: "Dashboard uses detected numeric and category fields; no source data is changed." }
    ]
  };
}

function sumField(rows: DatasetRow[], field?: string): number {
  if (!field) return 0;
  return rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
}

function groupByField(
  rows: DatasetRow[],
  dimensionField: string,
  metricField?: string,
  labeler: (value: DatasetRow[string]) => string = (value) => String(value ?? "Unknown"),
  sortBy: "value" | "label" = "value"
): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const label = labeler(row[dimensionField]);
    buckets.set(label, (buckets.get(label) ?? 0) + toNumber(metricField ? row[metricField] : 1));
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => sortBy === "label" ? a.label.localeCompare(b.label) : b.value - a.value)
    .slice(0, 8);
}

function groupMarginByField(
  rows: DatasetRow[],
  dimensionField: string,
  revenueField?: string,
  profitField?: string
): ChartPoint[] {
  const buckets = new Map<string, { revenue: number; profit: number }>();
  for (const row of rows) {
    const label = String(row[dimensionField] ?? "Unknown");
    const current = buckets.get(label) ?? { revenue: 0, profit: 0 };
    current.revenue += toNumber(revenueField ? row[revenueField] : 0);
    current.profit += toNumber(profitField ? row[profitField] : 0);
    buckets.set(label, current);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({
      label,
      value: value.revenue > 0 ? roundOne((value.profit / value.revenue) * 100) : 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function buildDriverMatrix(
  rows: DatasetRow[],
  dimensionField: string,
  revenueField?: string,
  profitField?: string,
  orderField?: string
): DriverMatrixRow[] {
  const buckets = new Map<string, { revenue: number; profit: number; orders: number }>();
  for (const row of rows) {
    const label = String(row[dimensionField] ?? "Unknown");
    const current = buckets.get(label) ?? { revenue: 0, profit: 0, orders: 0 };
    current.revenue += toNumber(revenueField ? row[revenueField] : 0);
    current.profit += toNumber(profitField ? row[profitField] : 0);
    current.orders += orderField ? toNumber(row[orderField]) : 1;
    buckets.set(label, current);
  }

  return Array.from(buckets.entries())
    .map(([label, value]) => ({
      label,
      revenue: value.revenue,
      profit: value.profit,
      orders: value.orders,
      margin: value.revenue > 0 ? roundOne((value.profit / value.revenue) * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

function buildGrowthSummary(trend: ChartPoint[]): GrowthSummary | undefined {
  if (trend.length < 2) return undefined;
  const previous = trend[trend.length - 2];
  const current = trend[trend.length - 1];
  const changePercent = previous.value ? roundOne(((current.value - previous.value) / previous.value) * 100) : 0;
  return {
    currentPeriod: current.label,
    previousPeriod: previous.label,
    changePercent,
    direction: changePercent > 0 ? "up" : changePercent < 0 ? "down" : "flat"
  };
}

function recommendCharts(
  profile: DatasetProfile,
  data: {
    trend: ChartPoint[];
    driverBreakdown: ChartPoint[];
    productMix: ChartPoint[];
    revenueVsProfit: ComparisonPoint[];
    marginByDimension: ChartPoint[];
    driverMatrix: DriverMatrixRow[];
  }
): ChartSpec[] {
  const charts: ChartSpec[] = [];
  const metric = profile.revenueField ?? "primary metric";
  const dimension = profile.primaryDimension ?? "primary dimension";
  const hasTrend = data.trend.length > 1;
  const hasDrivers = data.driverBreakdown.length > 0;
  const hasProductMix = data.productMix.length > 0;
  const hasProfitComparison = data.revenueVsProfit.some((point) => point.secondary > 0);
  const hasMargin = data.marginByDimension.length > 0;

  if (hasTrend) {
    charts.push(
      {
        id: "revenue-line-trend",
        title: "Revenue Line Trend",
        kind: "line",
        size: "wide",
        reason: `${profile.dateField ?? "Date"} creates a clear time series for ${metric}.`
      },
      {
        id: "revenue-area-trend",
        title: "Revenue Area Trend",
        kind: "area",
        size: "wide",
        reason: `Area chart highlights accumulated ${metric} movement over time.`
      },
      {
        id: "monthly-column-growth",
        title: "Monthly Column Growth",
        kind: "column",
        size: "medium",
        reason: `Column chart compares each period in ${profile.dateField ?? "the date field"}.`
      },
      {
        id: "revenue-distribution",
        title: "Revenue Distribution",
        kind: "histogram",
        size: "medium",
        reason: `Histogram shows the spread of ${metric} across periods.`
      }
    );
  }

  if (hasDrivers) {
    charts.push(
      {
        id: "dimension-bar",
        title: "Dimension Performance",
        kind: "bar",
        size: "medium",
        reason: `${dimension} is categorical, so bars make comparison easy.`
      },
      {
        id: "driver-heatmap",
        title: "Driver Heatmap",
        kind: "heatmap",
        size: "wide",
        reason: `Heatmap can reveal strong and weak pockets across ${dimension}.`
      },
      {
        id: "regional-choropleth",
        title: "Regional Choropleth",
        kind: "choropleth",
        size: "wide",
        reason: `${dimension} can be mapped when values represent regions, markets, or countries.`
      }
    );
  }

  if (hasProfitComparison) {
    charts.push(
      {
        id: "revenue-profit-stacked-bar",
        title: "Revenue Profit Stacked Bar",
        kind: "stacked-bar",
        size: "medium",
        reason: `${metric} and ${profile.profitField ?? "profit"} can be compared side by side.`
      },
      {
        id: "revenue-profit-stacked-column",
        title: "Revenue Profit Stacked Column",
        kind: "stacked-column",
        size: "medium",
        reason: `Stacked columns show period contribution between revenue and profit.`
      },
      {
        id: "revenue-profit-scatter",
        title: "Revenue Profit Scatter",
        kind: "scatter",
        size: "medium",
        reason: `Scatter plot reveals relationship between ${metric} and ${profile.profitField ?? "profit"}.`
      },
      {
        id: "revenue-profit-bubble",
        title: "Revenue Profit Bubble",
        kind: "bubble",
        size: "medium",
        reason: `Bubble chart can add order volume to the revenue and profit relationship.`
      }
    );
  }

  if (hasProductMix) {
    charts.push(
      {
        id: "product-pie",
        title: "Product Share Pie",
        kind: "pie",
        size: "small",
        reason: "Product categories create a simple share-of-total view."
      },
      {
        id: "product-doughnut",
        title: "Product Mix Doughnut",
        kind: "doughnut",
        size: "small",
        reason: "Product mix is ideal for showing share of total revenue."
      },
      {
        id: "product-treemap",
        title: "Product Treemap",
        kind: "treemap",
        size: "medium",
        reason: "Product hierarchy can fill space while showing relative contribution."
      }
    );
  }

  charts.push(
    {
      id: "executive-kpis",
      title: "Executive KPI Cards",
      kind: "kpi",
      size: "full",
      reason: "Leadership needs top-line metric cards before exploring charts."
    },
    {
      id: "profitability-gauge",
      title: "Profitability Gauge",
      kind: "gauge",
      size: "small",
      reason: `${profile.profitField ?? "Profit"} supports threshold-style executive monitoring.`
    },
    {
      id: "margin-bullet",
      title: "Margin Bullet Graph",
      kind: "bullet",
      size: "small",
      reason: hasMargin ? "Margin by dimension supports target and threshold comparison." : "A bullet graph can show KPI progress against a threshold."
    }
  );

  return charts;
}

function buildInsights(
  profile: DatasetProfile,
  rows: DatasetRow[],
  data: {
    trend: ChartPoint[];
    revenueVsProfit: ComparisonPoint[];
    driverBreakdown: ChartPoint[];
    marginByDimension: ChartPoint[];
    productMix: ChartPoint[];
    driverMatrix: DriverMatrixRow[];
  }
): Record<DashboardInsightKey, DashboardInsight> {
  const metric = profile.revenueField ?? "Primary metric";
  const latest = data.trend.at(-1);
  const previous = data.trend.at(-2);
  const first = data.trend[0];
  const latestChange = latest && previous && previous.value
    ? roundOne(((latest.value - previous.value) / previous.value) * 100)
    : 0;
  const totalChange = latest && first && first.value
    ? roundOne(((latest.value - first.value) / first.value) * 100)
    : 0;
  const topDriver = data.driverBreakdown[0];
  const secondDriver = data.driverBreakdown[1];
  const topMatrix = data.driverMatrix[0];
  const secondMatrix = data.driverMatrix[1];
  const topProduct = data.productMix[0];
  const totalProduct = data.productMix.reduce((sum, item) => sum + item.value, 0) || 1;
  const productShare = topProduct ? Math.round((topProduct.value / totalProduct) * 100) : 0;
  const confidence = rows.length < 8 ? "low" : rows.length < 30 ? "medium" : "high";
  const narrativeConfidence = rows.length < 5 ? "medium" : confidence;
  const margin = data.marginByDimension[0]?.value ?? 0;

  return {
    growth: {
      title: "Why revenue changed",
      takeaway: latestChange < 0
        ? `${metric} is down ${Math.abs(latestChange)}% in ${latest?.label ?? "the latest period"}.`
        : latestChange > 0
          ? `${metric} is up ${latestChange}% in ${latest?.label ?? "the latest period"}.`
          : `${metric} is flat in the latest period.`,
      detail: previous && latest
        ? `${metric} moved from ${formatNumber(previous.value)} to ${formatNumber(latest.value)}. Across the visible trend it changed ${totalChange}%, with ${topDriver?.label ?? "the top segment"} as the strongest current driver.`
        : `Add a date field to let Brisk explain period-over-period movement in ${metric}.`,
      confidence: narrativeConfidence,
      evidenceLabels: compact([profile.dateField, profile.revenueField, profile.primaryDimension])
    },
    regional: {
      title: "Regional comparison",
      takeaway: topDriver && secondDriver
        ? `${topDriver.label} leads ${secondDriver.label} by ${(topDriver.value / Math.max(secondDriver.value, 1)).toFixed(1)}x.`
        : `${topDriver?.label ?? "The top segment"} is the strongest visible segment.`,
      detail: topMatrix && secondMatrix
        ? `${topMatrix.label} has ${formatNumber(topMatrix.revenue)} revenue and ${topMatrix.margin}% margin; ${secondMatrix.label} has ${formatNumber(secondMatrix.revenue)} revenue and ${secondMatrix.margin}% margin.`
        : `Use ${profile.primaryDimension ?? "a dimension"} to compare performance across segments.`,
      confidence: narrativeConfidence,
      evidenceLabels: compact([profile.primaryDimension, profile.revenueField, profile.profitField])
    },
    revenueProfit: {
      title: "Profit relationship",
      takeaway: `Revenue and profit are both visible across ${data.revenueVsProfit.length} periods.`,
      detail: data.revenueVsProfit.length
        ? `Latest period shows ${formatNumber(data.revenueVsProfit.at(-1)?.primary ?? 0)} revenue against ${formatNumber(data.revenueVsProfit.at(-1)?.secondary ?? 0)} profit.`
        : `Add a profit field to compare revenue quality, not just scale.`,
      confidence: profile.profitField ? narrativeConfidence : "low",
      evidenceLabels: compact([profile.revenueField, profile.profitField, profile.dateField])
    },
    productMix: {
      title: "Product concentration",
      takeaway: topProduct
        ? `${topProduct.label} contributes ${productShare}% of revenue.`
        : "No product mix is available yet.",
      detail: topProduct
        ? `${topProduct.label} contributes ${formatNumber(topProduct.value)} out of ${formatNumber(totalProduct)}. Use this to see whether growth depends on one category.`
        : "Add product, category, or SKU data to explain mix shifts.",
      confidence: narrativeConfidence,
      evidenceLabels: compact([findField(profile.columns.map((column) => column.name), ["product", "category", "sku", "item"]), profile.revenueField])
    },
    margin: {
      title: "Margin watch",
      takeaway: margin > 0 && margin < 30
        ? `Best visible margin is ${margin}%, below the 30% watch line.`
        : margin > 0
          ? `Best visible margin is ${margin}%.`
          : "Margin needs profit and revenue fields.",
      detail: data.marginByDimension.length
        ? `${data.marginByDimension[0].label} leads margin, while revenue leadership remains with ${topDriver?.label ?? "the top segment"}.`
        : "Add profit data to calculate margin by segment.",
      confidence: profile.profitField ? narrativeConfidence : "low",
      evidenceLabels: compact([profile.profitField, profile.revenueField, profile.primaryDimension])
    },
    matrix: {
      title: "Driver matrix readout",
      takeaway: topMatrix
        ? `${topMatrix.label} is the top overall driver.`
        : "No driver matrix is available yet.",
      detail: topMatrix && secondMatrix
        ? `${topMatrix.label} leads revenue, profit, and orders; ${secondMatrix.label} trails at ${formatNumber(secondMatrix.revenue)} revenue and ${formatNumber(secondMatrix.profit)} profit.`
        : "Add a dimension plus revenue, profit, and order fields to create a fuller driver matrix.",
      confidence: narrativeConfidence,
      evidenceLabels: compact([profile.primaryDimension, profile.revenueField, profile.profitField, profile.orderField])
    },
    distribution: {
      title: "Distribution caveat",
      takeaway: rows.length < 8
        ? "Distribution is directional, not statistically strong."
        : "Distribution shows the spread of revenue values.",
      detail: rows.length < 8
        ? `This view uses only ${rows.length} rows, so treat the histogram as a shape preview rather than a reliable distribution.`
        : `The histogram uses ${rows.length.toLocaleString()} rows to show where values cluster.`,
      confidence,
      evidenceLabels: compact([profile.revenueField])
    },
    scatter: {
      title: "Relationship caveat",
      takeaway: rows.length < 8
        ? "Scatter needs more observations before reading correlation."
        : "Scatter can reveal whether profit moves with revenue.",
      detail: rows.length < 8
        ? `Only ${rows.length} rows are available, so Brisk shows the relationship but does not infer a durable correlation.`
        : `Compare point placement to see whether higher revenue also produces higher profit.`,
      confidence,
      evidenceLabels: compact([profile.revenueField, profile.profitField])
    }
  };
}

function createRisks(profile: DatasetProfile, margin: number, drivers: ChartPoint[]): string[] {
  return compact([
    margin > 0 && margin < 30 ? "Gross margin is below the 30% executive watch threshold." : undefined,
    profile.missingFields.length ? `Missing ${profile.missingFields[0]} limits target variance analysis.` : undefined,
    drivers[0] && drivers.length > 1 && drivers[0].value > drivers.slice(1).reduce((sum, item) => sum + item.value, 0)
      ? `${drivers[0].label} is highly concentrated versus other segments.`
      : undefined
  ]);
}

function createOpportunities(profile: DatasetProfile, drivers: ChartPoint[]): string[] {
  return compact([
    drivers[0] ? `Protect momentum in ${drivers[0].label}, the strongest detected driver.` : undefined,
    profile.profitField ? "Use profit field to create CFO-focused margin view." : undefined,
    profile.dateField ? "Trend field supports monthly business review reporting." : undefined
  ]);
}
