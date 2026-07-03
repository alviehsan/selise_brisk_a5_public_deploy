import type {
  DashboardModel,
  DashboardPackage,
  DatasetProfile,
  DatasetRow,
  EvidencePackage,
  PrivacySettings
} from "./briskTypes";
import { escapeCsv } from "./briskUtils";

export interface ExportContentRequest {
  dashboardName: string;
  dashboard: DashboardModel;
  evidencePackage: EvidencePackage;
  profile: DatasetProfile;
  privacySettings: PrivacySettings;
  rows: DatasetRow[];
}

export interface ShareUrlOptions {
  dashboardName?: string;
  hideRawData?: boolean;
  passwordEnabled?: boolean;
  expiryEnabled?: boolean;
  readOnly?: boolean;
}

export function exportDashboardPackage(format: string): DashboardPackage {
  return {
    format,
    version: "Executive version",
    permissions: {
      hideRawData: true
    },
    includes: ["AI executive summary", "Role-based recommendations", "Secure share controls"]
  };
}

export function serializeRowsAsCsv(rows: DatasetRow[]): string {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
  }

  return lines.join("\n");
}

export function createExcelWorkbookHtml({
  dashboard,
  dashboardName,
  evidencePackage,
  privacySettings,
  profile,
  rows
}: ExportContentRequest): string {
  return htmlDocument([
    section("Summary Sheet", [
      ["Brand", "SELISE Brisk a5"],
      ["Dashboard", dashboardName],
      ["Source file", profile.fileName],
      ["Domain", profile.domain.name],
      ["Readiness", `${profile.readinessScore}%`],
      ["Privacy", privacySettings.hideRawData ? "Raw data hidden" : "Raw data included"]
    ]),
    section("KPI Sheet", dashboard.kpis.map((kpi) => [kpi.label, kpi.value, kpi.sourceFields.join(" + ")])),
    section("Insight Sheet", Object.values(dashboard.insights).map((insight) => [
      insight.title,
      insight.takeaway,
      insight.confidence,
      insight.evidenceLabels.join(" + ")
    ])),
    section("Evidence Sheet", evidencePackage.subjects.map((subject) => [
      subject.title,
      subject.confidence,
      subject.sourceFields.join(" + "),
      subject.assumptions.join(" | ")
    ])),
    privacySettings.hideRawData ? "" : section("Raw Data Sheet", rowsAsMatrix(rows))
  ].filter(Boolean));
}

export function createPowerPointHtml({
  dashboard,
  dashboardName,
  evidencePackage,
  profile,
  privacySettings
}: ExportContentRequest): string {
  const topInsight = dashboard.insights.growth;
  return htmlDocument([
    slide("Executive Summary", [
      ["Brand", "SELISE Brisk a5"],
      ["Dashboard", dashboardName],
      ["Domain", profile.domain.name],
      ["Summary", dashboard.summary.join(" ")]
    ]),
    slide("KPI Overview", dashboard.kpis.map((kpi) => [kpi.label, kpi.value])),
    slide("Leadership Insight", [
      [topInsight.title, topInsight.takeaway],
      ["Evidence", topInsight.evidenceLabels.join(" + ")],
      ["Privacy", privacySettings.hideRawData ? "Raw data hidden" : "Raw data included"]
    ]),
    slide("Evidence Appendix", evidencePackage.assumptions.map((assumption) => ["Assumption", assumption]))
  ]);
}

export function makeShareUrl(profile: DatasetProfile, options: ShareUrlOptions = {}): string {
  const payload = btoa(
    encodeURIComponent(
      JSON.stringify({
        fileName: profile.fileName,
        domain: profile.domain.name,
        readinessScore: profile.readinessScore,
        qualityScore: profile.qualityScore,
        dashboardName: options.dashboardName,
        hideRawData: options.hideRawData,
        passwordProtected: options.passwordEnabled,
        expires: options.expiryEnabled ? "7 days" : "Never",
        readOnly: options.readOnly ?? true
      })
    )
  );
  return `${window.location.origin}${window.location.pathname}#share=${payload}`;
}

function htmlDocument(sections: string[]): string {
  return [
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<style>",
    "body{font-family:Arial,sans-serif;color:#0d2f33}h1,h2{color:#015b64}table{border-collapse:collapse;width:100%;margin:12px 0 28px}th,td{border:1px solid #d8e5e2;padding:8px;text-align:left}.slide{page-break-after:always;min-height:540px;padding:32px}",
    "</style>",
    "</head>",
    "<body>",
    sections.join("\n"),
    "</body>",
    "</html>"
  ].join("");
}

function section(title: string, rows: Array<Array<string | number | boolean>>): string {
  return [
    `<h1>${escapeHtml(title)}</h1>`,
    "<table>",
    "<tbody>",
    rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join(""),
    "</tbody>",
    "</table>"
  ].join("");
}

function slide(title: string, rows: Array<Array<string | number | boolean>>): string {
  return `<section class="slide">${section(title, rows)}</section>`;
}

function rowsAsMatrix(rows: DatasetRow[]): string[][] {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers,
    ...rows.map((row) => headers.map((header) => String(row[header] ?? "")))
  ];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return map[char] ?? char;
  });
}
