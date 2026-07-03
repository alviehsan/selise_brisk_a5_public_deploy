import { describe, expect, it } from "vitest";
import {
  importConnectorRows,
  listDataConnectors,
  refreshConnectorRows,
  type ConnectorSettings
} from "./brisk";

describe("data connectors", () => {
  it("lists MVP connectors for common business systems", () => {
    const connectors = listDataConnectors();
    const ids = connectors.map((connector) => connector.id);

    expect(ids).toEqual(expect.arrayContaining([
      "google-sheets",
      "onedrive-excel",
      "database",
      "crm",
      "finance",
      "ads",
      "product-analytics"
    ]));
    expect(connectors.find((connector) => connector.id === "google-sheets")).toMatchObject({
      label: "Google Sheets",
      status: "demo"
    });
  });

  it("imports pasted Google Sheets CSV through the connector pipeline", () => {
    const result = importConnectorRows({
      connectorId: "google-sheets",
      sourceText: "Order Date,Region,Sales Amount\n2026-04-01,East,220000\n2026-05-01,West,180000",
      sourceName: "Q3 Sheet"
    });

    expect(result.connectorLabel).toBe("Google Sheets");
    expect(result.sourceName).toBe("Q3 Sheet");
    expect(result.rows).toEqual([
      { "Order Date": "2026-04-01", Region: "East", "Sales Amount": 220000 },
      { "Order Date": "2026-05-01", Region: "West", "Sales Amount": 180000 }
    ]);
    expect(result.rowCount).toBe(2);
  });

  it("uses demo rows when a mock source URL is provided", () => {
    const result = importConnectorRows({
      connectorId: "crm",
      sourceText: "https://crm.example.com/report/weekly-sales"
    });

    expect(result.sourceName).toBe("CRM demo source");
    expect(result.rows.length).toBeGreaterThan(1);
    expect(result.rows[0]).toHaveProperty("Sales Amount");
  });

  it("refreshes a connector from persisted settings", () => {
    const settings: ConnectorSettings = {
      selectedConnectorId: "google-sheets",
      sourceName: "Q3 Sheet",
      sourceText: "Order Date,Region,Sales Amount\n2026-04-01,East,220000",
      lastRefreshAt: "2026-07-01T00:00:00.000Z",
      rowCount: 1
    };

    const result = refreshConnectorRows(settings);

    expect(result.connectorId).toBe("google-sheets");
    expect(result.sourceName).toBe("Q3 Sheet");
    expect(result.rowCount).toBe(1);
    expect(new Date(result.lastRefreshAt).getTime()).toBeGreaterThan(new Date(settings.lastRefreshAt).getTime());
  });
});
