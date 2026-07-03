import { describe, expect, it } from "vitest";
import { analyzeDataset } from "./dataProfile";
import { buildSemanticModel } from "./semanticModel";
import type { DatasetRow, SemanticFieldOverride } from "./briskTypes";

const rows: DatasetRow[] = [
  {
    "Order Date": "2026-01-15",
    Region: "North",
    Product: "Category A",
    "Sales Amount": 120000,
    "Gross Profit": 42000,
    "Sales Target": 130000,
    Orders: 420,
    Customer: "Apex Group"
  },
  {
    "Order Date": "2026-02-15",
    Region: "South",
    Product: "Category B",
    "Sales Amount": 98000,
    "Gross Profit": 26000,
    "Sales Target": 110000,
    Orders: 360,
    Customer: "Bluebird Ltd"
  }
];

describe("semantic model", () => {
  it("maps uploaded fields to business aliases with explainable evidence", () => {
    const profile = analyzeDataset(rows);
    const model = buildSemanticModel(profile, rows);

    expect(model.aliases).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldName: "Sales Amount", alias: "Revenue", role: "metric" }),
      expect.objectContaining({ fieldName: "Gross Profit", alias: "Profit", role: "metric" }),
      expect.objectContaining({ fieldName: "Region", alias: "Geography", role: "dimension" }),
      expect.objectContaining({ fieldName: "Product", alias: "Product", role: "dimension" }),
      expect.objectContaining({ fieldName: "Sales Target", alias: "Target", role: "target" })
    ]));
    expect(model.evidenceReferences.find((item) => item.fieldName === "Sales Amount")?.reason).toContain("Revenue");
    expect(model.schemaGraph.nodes.some((node) => node.label === "Revenue")).toBe(true);
    expect(model.schemaGraph.edges.some((edge) => edge.label === "maps to")).toBe(true);
  });

  it("announces available semantic formulas from detected aliases", () => {
    const model = buildSemanticModel(analyzeDataset(rows), rows);

    expect(model.formulas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "margin", available: true, expression: "Profit / Revenue" }),
      expect.objectContaining({ id: "growth-rate", available: true, expression: "(Current Revenue - Previous Revenue) / Previous Revenue" }),
      expect.objectContaining({ id: "variance", available: true, expression: "Revenue - Target" }),
      expect.objectContaining({ id: "contribution-share", available: true, expression: "Segment Revenue / Total Revenue" })
    ]));
  });

  it("creates quality warnings when semantic ingredients are missing", () => {
    const sparseRows = [{ Month: "2026-01", Revenue: 1000 }];
    const model = buildSemanticModel(analyzeDataset(sparseRows), sparseRows);

    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "medium", message: expect.stringContaining("dimension") }),
      expect.objectContaining({ severity: "low", message: expect.stringContaining("target") })
    ]));
    expect(model.formulas.find((formula) => formula.id === "variance")?.available).toBe(false);
  });

  it("uses user role overrides as authoritative evidence", () => {
    const overrides: SemanticFieldOverride[] = [{ fieldName: "Customer", role: "dimension" }];
    const profile = analyzeDataset(rows, "sales.csv", { semanticOverrides: overrides });
    const model = buildSemanticModel(profile, rows, overrides);

    expect(model.aliases.find((alias) => alias.fieldName === "Customer")).toMatchObject({
      alias: "Customer",
      role: "dimension",
      source: "user"
    });
    expect(model.evidenceReferences.find((item) => item.fieldName === "Customer")?.reason).toContain("User selected");
  });
});
