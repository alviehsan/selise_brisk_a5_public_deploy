import { describe, expect, it } from "vitest";
import { analyzeDataset, buildDashboard, buildSemanticModel, createEvidencePackage } from "./brisk";
import type { AiAuditEvent, PrivacySettings } from "./briskTypes";

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

const privacy: PrivacySettings = {
  hideRawData: false,
  maskSensitiveFields: false,
  includeAiPrompts: true,
  includeEvidencePackage: true
};

describe("evidence package", () => {
  it("builds traceable evidence for dashboard insights", () => {
    const profile = analyzeDataset(rows, "sales.csv");
    const dashboard = buildDashboard(profile, rows);
    const semanticModel = buildSemanticModel(profile, rows, []);
    const auditTrail: AiAuditEvent[] = [{
      id: "audit-1",
      timestamp: "2026-07-02T00:00:00.000Z",
      question: "Why did revenue drop?",
      providerLabel: "OpenAI",
      model: "gpt-4.1-mini",
      actionTitle: "Explain Insight",
      status: "proposed",
      evidenceFields: ["Sales Amount"]
    }];

    const evidence = createEvidencePackage({
      profile,
      dashboard,
      semanticModel,
      rows,
      auditTrail,
      privacySettings: privacy
    });

    expect(evidence.subjects.find((item) => item.id === "growth")).toMatchObject({
      title: "Why revenue changed",
      confidence: "medium",
      sourceFields: ["Order Date", "Sales Amount", "Region"]
    });
    expect(evidence.formulas.map((formula) => formula.label)).toContain("Margin");
    expect(evidence.assumptions).toContain("Dashboard uses uploaded sales.csv only.");
    expect(evidence.rowPreview[0].values.Region).toBe("North");
    expect(evidence.auditTrail[0]).toMatchObject({
      providerLabel: "OpenAI",
      model: "gpt-4.1-mini"
    });
  });

  it("masks sensitive row previews and AI prompts when privacy controls require it", () => {
    const profile = analyzeDataset(rows, "sales.csv");
    const dashboard = buildDashboard(profile, rows);
    const semanticModel = buildSemanticModel(profile, rows, []);

    const evidence = createEvidencePackage({
      profile,
      dashboard,
      semanticModel,
      rows,
      auditTrail: [{
        id: "audit-1",
        timestamp: "2026-07-02T00:00:00.000Z",
        question: "Show customer revenue",
        providerLabel: "Anthropic",
        model: "claude-3-5-sonnet",
        actionTitle: "Chat response",
        status: "answered",
        evidenceFields: ["Customer", "Sales Amount"]
      }],
      privacySettings: {
        ...privacy,
        hideRawData: true,
        maskSensitiveFields: true,
        includeAiPrompts: false
      }
    });

    expect(evidence.rowPreview[0].values.Customer).toBe("Masked");
    expect(evidence.rowPreview[0].values["Sales Amount"]).toBe("Hidden");
    expect(evidence.auditTrail[0].question).toBe("Hidden by privacy controls");
  });
});
