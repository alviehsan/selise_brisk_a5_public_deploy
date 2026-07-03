import { describe, expect, it } from "vitest";
import {
  analyzeDataset,
  buildDashboard,
  buildSemanticModel,
  createEvidencePackage,
  createExcelWorkbookHtml,
  createPowerPointHtml,
  makeShareUrl
} from "./brisk";
import { defaultPrivacySettings } from "./evidencePackage";

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
  }
];

function context(hideRawData = true) {
  const profile = analyzeDataset(rows, "sales.csv");
  const dashboard = buildDashboard(profile, rows);
  const semanticModel = buildSemanticModel(profile, rows, []);
  const privacySettings = { ...defaultPrivacySettings, hideRawData };
  const evidencePackage = createEvidencePackage({
    profile,
    dashboard,
    semanticModel,
    rows,
    auditTrail: [],
    privacySettings
  });

  return { dashboard, evidencePackage, privacySettings, profile, rows };
}

describe("dashboard export package", () => {
  it("creates a branded Excel workbook with summary, KPI, and evidence sheets", () => {
    const { dashboard, evidencePackage, privacySettings, profile } = context(true);

    const workbook = createExcelWorkbookHtml({
      profile,
      dashboard,
      evidencePackage,
      rows,
      privacySettings,
      dashboardName: "Leadership command center"
    });

    expect(workbook).toContain("SELISE Brisk a5");
    expect(workbook).toContain("Leadership command center");
    expect(workbook).toContain("Summary Sheet");
    expect(workbook).toContain("KPI Sheet");
    expect(workbook).toContain("Evidence Sheet");
    expect(workbook).not.toContain("Raw Data Sheet");
    expect(workbook).not.toContain("Apex Group");
  });

  it("includes raw data sheet only when privacy allows it", () => {
    const { dashboard, evidencePackage, privacySettings, profile } = context(false);

    const workbook = createExcelWorkbookHtml({
      profile,
      dashboard,
      evidencePackage,
      rows,
      privacySettings,
      dashboardName: "Leadership command center"
    });

    expect(workbook).toContain("Raw Data Sheet");
    expect(workbook).toContain("Apex Group");
  });

  it("creates a branded PowerPoint-compatible leadership package", () => {
    const { dashboard, evidencePackage, privacySettings, profile } = context(true);

    const deck = createPowerPointHtml({
      profile,
      dashboard,
      evidencePackage,
      rows,
      privacySettings,
      dashboardName: "Leadership command center"
    });

    expect(deck).toContain("SELISE Brisk a5");
    expect(deck).toContain("Executive Summary");
    expect(deck).toContain("Evidence Appendix");
    expect(deck).toContain("Leadership command center");
  });

  it("creates read-only share URLs with privacy, password, and expiry metadata", () => {
    const { profile } = context(true);
    const url = makeShareUrl(profile, {
      dashboardName: "Leadership command center",
      hideRawData: true,
      passwordEnabled: true,
      expiryEnabled: true,
      readOnly: true
    });
    const payload = JSON.parse(decodeURIComponent(atob(url.split("#share=")[1])));

    expect(payload).toMatchObject({
      dashboardName: "Leadership command center",
      hideRawData: true,
      passwordProtected: true,
      expires: "7 days",
      readOnly: true
    });
  });
});
