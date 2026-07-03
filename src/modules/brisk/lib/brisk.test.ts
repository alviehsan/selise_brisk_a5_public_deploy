import { describe, expect, it } from "vitest";
import {
  analyzeDataset,
  buildDashboard,
  createDashboardRecommendations,
  createValidatedAction,
  exportDashboardPackage,
  serializeRowsAsCsv
} from "./brisk";

const rows = [
  {
    "Order Date": "2026-01-15",
    Region: "North",
    Product: "Category A",
    "Sales Amount": 120000,
    "Gross Profit": 42000,
    Orders: 420,
    Customer: "Apex Group"
  },
  {
    "Order Date": "2026-02-15",
    Region: "South",
    Product: "Category B",
    "Sales Amount": 98000,
    "Gross Profit": 26000,
    Orders: 360,
    Customer: "Bluebird Ltd"
  },
  {
    "Order Date": "2026-03-15",
    Region: "North",
    Product: "Category B",
    "Sales Amount": 76000,
    "Gross Profit": 15000,
    Orders: 310,
    Customer: "Apex Group"
  }
];

describe("Brisk data engine", () => {
  it("profiles uploaded business rows and detects a sales domain", () => {
    const profile = analyzeDataset(rows, "real-upload.csv");

    expect(profile.fileName).toBe("real-upload.csv");
    expect(profile.rowCount).toBe(3);
    expect(profile.columnCount).toBe(7);
    expect(profile.domain.name).toBe("Sales / Revenue");
    expect(profile.domain.confidence).toBeGreaterThanOrEqual(90);
    expect(profile.missingFields).toContain("Sales Target");
    expect(profile.columns.find((column) => column.name === "Sales Amount")?.type).toBe("numeric");
  });

  it("creates ranked dashboard recommendations from a profile", () => {
    const recommendations = createDashboardRecommendations(analyzeDataset(rows));

    expect(recommendations).toHaveLength(4);
    expect(recommendations[0]).toMatchObject({
      name: "Executive Sales Performance Dashboard",
      confidence: 94,
      audience: "CEO, CRO, Head of Sales"
    });
    expect(recommendations[0].kpis).toContain("Revenue");
    expect(recommendations[0].limitations).toContain("Sales Target not found");
  });

  it("validates dashboard actions before applying AI changes", () => {
    const profile = analyzeDataset(rows);
    const action = createValidatedAction(profile, "Why did revenue drop in March?");

    expect(action.status).toBe("passed");
    expect(action.action).toBe("add_chart");
    expect(action.title).toBe("March Revenue Drop Drivers");
    expect(action.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects invalid AI chart actions when required fields are missing", () => {
    const profile = analyzeDataset([{ Region: "North", Revenue: 10 }]);
    const action = createValidatedAction(profile, "Add revenue by customer chart");

    expect(action.status).toBe("failed");
    expect(action.checks.some((check) => !check.passed)).toBe(true);
  });

  it("builds dashboard KPIs and chart series from uploaded rows", () => {
    const dashboard = buildDashboard(analyzeDataset(rows), rows);

    expect(dashboard.kpis.find((kpi) => kpi.label === "Revenue")?.value).toBe("$294K");
    expect(dashboard.kpis.find((kpi) => kpi.label === "Gross Margin")?.value).toBe("28.2%");
    expect(dashboard.trend).toEqual([
      { label: "2026-01", value: 120000 },
      { label: "2026-02", value: 98000 },
      { label: "2026-03", value: 76000 }
    ]);
    expect(dashboard.driverBreakdown[0]).toEqual({ label: "North", value: 196000 });
  });

  it("builds richer intelligence series for growth, margin, profit, and product mix", () => {
    const dashboard = buildDashboard(analyzeDataset(rows), rows);

    expect(dashboard.growthSummary).toMatchObject({
      currentPeriod: "2026-03",
      previousPeriod: "2026-02",
      changePercent: -22.4,
      direction: "down"
    });
    expect(dashboard.profitTrend).toEqual([
      { label: "2026-01", value: 42000 },
      { label: "2026-02", value: 26000 },
      { label: "2026-03", value: 15000 }
    ]);
    expect(dashboard.marginByDimension[0]).toEqual({ label: "North", value: 29.1 });
    expect(dashboard.productMix[0]).toEqual({ label: "Category B", value: 174000 });
    expect(dashboard.driverMatrix[0]).toMatchObject({
      label: "North",
      revenue: 196000,
      profit: 57000,
      orders: 730,
      margin: 29.1
    });
  });

  it("recommends chart kinds from detected data shape", () => {
    const dashboard = buildDashboard(analyzeDataset(rows), rows);
    const kinds = dashboard.recommendedCharts.map((chart) => chart.kind);

    expect(kinds).toEqual(expect.arrayContaining([
      "line",
      "area",
      "column",
      "bar",
      "stacked-bar",
      "stacked-column",
      "doughnut",
      "treemap",
      "kpi",
      "gauge",
      "bullet",
      "scatter",
      "histogram",
      "bubble",
      "heatmap",
      "choropleth"
    ]));
    expect(dashboard.recommendedCharts.find((chart) => chart.kind === "line")?.size).toBe("wide");
    expect(dashboard.recommendedCharts.find((chart) => chart.kind === "doughnut")?.reason).toContain("Product");
  });

  it("creates data-backed insight notes for dashboard visuals", () => {
    const dashboard = buildDashboard(analyzeDataset(rows), rows);

    expect(dashboard.insights.growth).toMatchObject({
      title: "Why revenue changed",
      confidence: "medium"
    });
    expect(dashboard.insights.growth.takeaway).toContain("down 22.4%");
    expect(dashboard.insights.growth.detail).toContain("98,000 to 76,000");
    expect(dashboard.insights.regional.takeaway).toContain("North leads South by 2.0x");
    expect(dashboard.insights.matrix.detail).toContain("North leads revenue, profit, and orders");
    expect(dashboard.insights.productMix.takeaway).toContain("Category B contributes 59%");
    expect(dashboard.insights.distribution.confidence).toBe("low");
    expect(dashboard.insights.distribution.detail).toContain("only 3 rows");
  });

  it("prefers numeric sales metrics over text columns such as Salesperson", () => {
    const messyRows = [
      { Month: "2025-01", Region: "East", Salesperson: "Ava", Sales: 1000, Profit: 250, Units: 10 },
      { Month: "2025-02", Region: "West", Salesperson: "Noor", Sales: 2000, Profit: 500, Units: 20 },
      { Month: "2025-03", Region: "East", Salesperson: "Mia", Sales: 1500, Profit: 360, Units: 15 }
    ];
    const profile = analyzeDataset(messyRows, "Product-Sales-Region.xlsx");
    const dashboard = buildDashboard(profile, messyRows);

    expect(profile.revenueField).toBe("Sales");
    expect(profile.primaryDimension).toBe("Region");
    expect(dashboard.kpis.find((kpi) => kpi.label === "Revenue")?.value).toBe("$5K");
    expect(dashboard.driverBreakdown[0]).toEqual({ label: "East", value: 2500 });
    expect(dashboard.trend).toEqual([
      { label: "2025-01", value: 1000 },
      { label: "2025-02", value: 2000 },
      { label: "2025-03", value: 1500 }
    ]);
  });

  it("applies semantic role corrections when profiling uploaded data", () => {
    const profile = analyzeDataset(rows, "sales.csv", {
      semanticOverrides: [
        { fieldName: "Customer", role: "dimension" },
        { fieldName: "Orders", role: "benchmark" }
      ]
    });
    const dashboard = buildDashboard(profile, rows);

    expect(profile.primaryDimension).toBe("Customer");
    expect(profile.benchmarkField).toBe("Orders");
    expect(dashboard.driverBreakdown[0]).toEqual({ label: "Apex Group", value: 196000 });
  });

  it("detects target fields for semantic variance analysis", () => {
    const targetRows = [
      { Month: "2026-01", Region: "North", Revenue: 1000, Target: 1200 },
      { Month: "2026-02", Region: "South", Revenue: 1400, Target: 1300 }
    ];
    const profile = analyzeDataset(targetRows);

    expect(profile.revenueField).toBe("Revenue");
    expect(profile.targetField).toBe("Target");
    expect(profile.columns.find((column) => column.name === "Target")?.role).toBe("target");
  });

  it("packages export options with secure share controls", () => {
    const pkg = exportDashboardPackage("share");

    expect(pkg.format).toBe("share");
    expect(pkg.version).toBe("Executive version");
    expect(pkg.permissions.hideRawData).toBe(true);
    expect(pkg.includes).toContain("AI executive summary");
  });

  it("serializes uploaded rows for export", () => {
    const csv = serializeRowsAsCsv(rows);

    expect(csv).toContain("Order Date,Region,Product,Sales Amount,Gross Profit,Orders,Customer");
    expect(csv).toContain("2026-01-15,North,Category A,120000,42000,420,Apex Group");
  });
});
