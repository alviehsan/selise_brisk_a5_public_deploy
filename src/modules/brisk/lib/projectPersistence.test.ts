import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadProjectSnapshot,
  saveProjectSnapshot,
  sanitizeProjectSnapshot,
  storeProviderSecret,
  type ProjectSnapshot
} from "./projectPersistence";

const snapshot: ProjectSnapshot = {
  id: "default",
  dashboardName: "Executive Sales Performance Dashboard",
  fileName: "sales.csv",
  rows: [{ Region: "North", Revenue: 100 }],
  widgetOrder: ["kpis", "growth"],
  dashboardTabs: [{ id: "overview", label: "Executive Overview" }],
  activeDashboardTab: "overview",
  selectedFormat: "Excel",
  semanticOverrides: [{ fieldName: "Customer", role: "dimension" }],
  builderSettings: {
    selectedWidgetId: "drivers",
    selectedFilterValue: "North",
    widgetSettings: {
      drivers: { chartType: "area", size: "full" }
    }
  },
  providerSettings: {
    selectedProviderId: "custom-compatible",
    customProviderEndpoint: "https://llm.example.com/v1",
    customProviderApiKey: "secret-key"
  },
  chatMessages: [{ id: "welcome", role: "assistant", content: "Hello" }],
  auditTrail: [{
    id: "audit-1",
    timestamp: "2026-07-02T00:00:00.000Z",
    question: "Why did revenue drop?",
    providerLabel: "OpenAI",
    model: "gpt-4.1-mini",
    actionTitle: "Explain Insight",
    status: "answered",
    evidenceFields: ["Revenue"]
  }],
  privacySettings: {
    hideRawData: true,
    maskSensitiveFields: true,
    includeAiPrompts: false,
    includeEvidencePackage: true
  },
  connectorSettings: {
    selectedConnectorId: "google-sheets",
    sourceName: "Q3 Sheet",
    sourceText: "Order Date,Region,Sales Amount\n2026-04-01,East,220000",
    lastRefreshAt: "2026-07-02T00:00:00.000Z",
    rowCount: 1
  },
  updatedAt: "2026-07-01T00:00:00.000Z"
};

describe("project persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("saves project snapshots through the Blocks Data Gateway without API keys", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: {
        insertBriskDashboard: {
          acknowledged: true,
          itemId: "dashboard-1"
        }
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveProjectSnapshot(snapshot, {
      accessToken: "user-token",
      apiBaseUrl: "https://api.seliseblocks.com",
      projectSlug: "dfqocj",
      xBlocksKey: "blocks-key"
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0]?.[1].body));
    const savedSnapshot = JSON.parse(body.variables.input.evidenceJson);

    expect(result.mode).toBe("blocks");
    expect(calls[0]?.[0]).toBe("https://api.seliseblocks.com/uds/v1/dfqocj/gateway");
    expect(body.query).toContain("insertBriskDashboard");
    expect(savedSnapshot.providerSettings.customProviderEndpoint).toBe("https://llm.example.com/v1");
    expect(savedSnapshot.providerSettings.customProviderApiKey).toBeUndefined();
    expect(savedSnapshot.semanticOverrides).toEqual([{ fieldName: "Customer", role: "dimension" }]);
    expect(savedSnapshot.builderSettings.widgetSettings.drivers).toEqual({ chartType: "area", size: "full" });
    expect(savedSnapshot.auditTrail[0].providerLabel).toBe("OpenAI");
    expect(savedSnapshot.privacySettings.maskSensitiveFields).toBe(true);
    expect(savedSnapshot.connectorSettings.selectedConnectorId).toBe("google-sheets");
    expect(JSON.stringify(savedSnapshot.connectorSettings)).not.toContain("token");
  });

  it("loads project snapshots from the backend API", async () => {
    const sanitized = sanitizeProjectSnapshot(snapshot);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: {
        getBriskDashboards: {
          totalCount: 1,
          items: [{
            ItemId: "dashboard-1",
            name: sanitized.dashboardName,
            evidenceJson: JSON.stringify(sanitized),
            updatedAt: sanitized.updatedAt
          }]
        }
      }
    }), { status: 200 })));

    const loaded = await loadProjectSnapshot("default", {
      accessToken: "user-token",
      apiBaseUrl: "https://api.seliseblocks.com",
      projectSlug: "dfqocj",
      xBlocksKey: "blocks-key"
    });

    expect(loaded?.dashboardName).toBe("Executive Sales Performance Dashboard");
    expect(loaded?.providerSettings.customProviderEndpoint).toBe("https://llm.example.com/v1");
    expect(loaded?.providerSettings.customProviderApiKey).toBeUndefined();
    expect(loaded?.auditTrail?.[0].actionTitle).toBe("Explain Insight");
    expect(loaded?.privacySettings?.includeAiPrompts).toBe(false);
    expect(loaded?.connectorSettings?.sourceName).toBe("Q3 Sheet");
  });

  it("falls back to localStorage for non-secret project data when API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    const result = await saveProjectSnapshot(snapshot, { apiBaseUrl: "http://127.0.0.1:8787" });
    const stored = JSON.parse(localStorage.getItem("brisk.project.default") ?? "{}");

    expect(result.mode).toBe("local");
    expect(stored.dashboardName).toBe("Executive Sales Performance Dashboard");
    expect(stored.providerSettings.customProviderEndpoint).toBe("https://llm.example.com/v1");
    expect(stored.providerSettings.customProviderApiKey).toBeUndefined();
    expect(stored.auditTrail[0].model).toBe("gpt-4.1-mini");
    expect(stored.privacySettings.hideRawData).toBe(true);
    expect(stored.connectorSettings.rowCount).toBe(1);
    expect(JSON.stringify(stored)).not.toContain("secret-key");
  });

  it("does not persist provider API keys when no backend vault is available", async () => {
    const result = await storeProviderSecret({
      projectId: "default",
      providerId: "custom-compatible",
      endpoint: "https://llm.example.com/v1",
      apiKey: "secret-key"
    });

    expect(result.status).toBe("unavailable");
    expect(result.keyPersisted).toBe(false);
    expect(localStorage.getItem("brisk.project.default")).toBeNull();
  });
});
