import { describe, expect, it } from "vitest";
import { scoreChartSuitability } from "./chartSuitability";
import { analyzeDataset } from "./dataProfile";
import type { ChartKind, DatasetRow } from "./briskTypes";

const salesRows: DatasetRow[] = [
  { Month: "2026-01", Region: "North", Product: "A", Revenue: 120000, Profit: 42000, Orders: 420 },
  { Month: "2026-02", Region: "South", Product: "B", Revenue: 98000, Profit: 26000, Orders: 360 },
  { Month: "2026-03", Region: "North", Product: "B", Revenue: 76000, Profit: 15000, Orders: 310 }
];

function score(kind: ChartKind, rows = salesRows) {
  return scoreChartSuitability({
    kind,
    profile: analyzeDataset(rows),
    rows
  });
}

describe("chart suitability", () => {
  it("scores trend charts high only when a date series exists", () => {
    expect(score("line")).toMatchObject({ status: "recommended" });
    expect(score("area").score).toBeGreaterThanOrEqual(80);

    const noDate = score("line", [
      { Region: "North", Revenue: 100 },
      { Region: "South", Revenue: 200 }
    ]);
    expect(noDate.status).toBe("blocked");
    expect(noDate.reason).toContain("date");
  });

  it("requires at least two parts for composition charts", () => {
    expect(score("doughnut")).toMatchObject({ status: "recommended" });
    const onePart = score("pie", [
      { Month: "2026-01", Product: "Only", Revenue: 100 }
    ]);

    expect(onePart.status).toBe("blocked");
    expect(onePart.reason).toContain("two");
  });

  it("requires two numeric measures for relationship charts", () => {
    expect(score("scatter")).toMatchObject({ status: "recommended" });
    const oneMetric = score("scatter", [
      { Month: "2026-01", Region: "North", Revenue: 100 },
      { Month: "2026-02", Region: "South", Revenue: 200 }
    ]);

    expect(oneMetric.status).toBe("blocked");
    expect(oneMetric.reason).toContain("two numeric");
  });

  it("warns for choropleth when the dimension is not geography-like", () => {
    const productOnly = score("choropleth", [
      { Month: "2026-01", Product: "A", Revenue: 100 },
      { Month: "2026-02", Product: "B", Revenue: 200 }
    ]);

    expect(score("choropleth").status).toBe("recommended");
    expect(productOnly.status).toBe("warning");
    expect(productOnly.reason).toContain("geography");
  });
});
