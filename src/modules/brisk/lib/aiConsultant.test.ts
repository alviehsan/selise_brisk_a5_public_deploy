import { describe, expect, it } from "vitest";
import { createConsultantResponse } from "./aiConsultant";
import { analyzeDataset } from "./dataProfile";
import { buildDashboard } from "./dashboardBuilder";
import { buildSemanticModel } from "./semanticModel";
import type { DatasetRow } from "./briskTypes";

const rows: DatasetRow[] = [
  { Month: "2026-01", Region: "North", Product: "A", Revenue: 120000, Profit: 42000, Orders: 420 },
  { Month: "2026-02", Region: "South", Product: "B", Revenue: 98000, Profit: 26000, Orders: 360 },
  { Month: "2026-03", Region: "North", Product: "B", Revenue: 76000, Profit: 15000, Orders: 310 }
];

function makeContext() {
  const profile = analyzeDataset(rows, "sales.csv");
  const dashboard = buildDashboard(profile, rows);
  const semanticModel = buildSemanticModel(profile, rows);
  return { profile, dashboard, semanticModel };
}

describe("AI consultant engine", () => {
  it("answers revenue driver questions with evidence and caveats", () => {
    const response = createConsultantResponse({
      question: "Why did revenue drop in March?",
      ...makeContext()
    });

    expect(response.answer).toContain("Revenue");
    expect(response.confidence).toBe("medium");
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.evidence[0]).toMatchObject({ fieldName: "Revenue" });
    expect(response.caveats.some((caveat) => caveat.includes("uploaded"))).toBe(true);
  });

  it("proposes validated dashboard actions from free-form questions", () => {
    const context = makeContext();
    const addChart = createConsultantResponse({ question: "Add a product doughnut chart", ...context });
    const rename = createConsultantResponse({ question: "Rename dashboard to Revenue Command Center", ...context });
    const createTab = createConsultantResponse({ question: "Create a tab for margin review", ...context });
    const removeChart = createConsultantResponse({ question: "Remove the risks chart", ...context });
    const exportSummary = createConsultantResponse({ question: "Export a summary", ...context });

    expect(addChart.proposedActions[0]).toMatchObject({
      type: "add_chart",
      title: "Add Product Mix Doughnut",
      status: "passed"
    });
    expect(addChart.proposedActions[0].payload).toMatchObject({ widgetId: "aiProductDoughnut" });
    expect(rename.proposedActions[0]).toMatchObject({
      type: "rename_dashboard",
      payload: { name: "Revenue Command Center" }
    });
    expect(createTab.proposedActions[0]).toMatchObject({ type: "create_tab" });
    expect(removeChart.proposedActions[0]).toMatchObject({
      type: "remove_chart",
      payload: { widgetId: "risks" }
    });
    expect(exportSummary.proposedActions[0]).toMatchObject({ type: "export_summary" });
  });

  it("blocks actions that reference unavailable or hallucinated fields", () => {
    const response = createConsultantResponse({
      question: "Add churn by renewal date chart",
      ...makeContext()
    });

    expect(response.proposedActions[0]).toMatchObject({
      type: "add_chart",
      status: "failed"
    });
    expect(response.proposedActions[0].checks.some((check) => !check.passed)).toBe(true);
    expect(response.caveats.join(" ")).toContain("churn");
  });
});
