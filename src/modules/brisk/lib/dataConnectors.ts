import type { DatasetRow } from "./briskTypes";
import { parseCsvText } from "./fileParser";

export type ConnectorId =
  | "google-sheets"
  | "onedrive-excel"
  | "database"
  | "crm"
  | "finance"
  | "ads"
  | "product-analytics";

export interface DataConnector {
  id: ConnectorId;
  label: string;
  category: "spreadsheet" | "database" | "saas";
  status: "demo" | "planned";
  description: string;
}

export interface ConnectorSettings {
  selectedConnectorId: ConnectorId;
  sourceName: string;
  sourceText: string;
  lastRefreshAt: string;
  rowCount: number;
}

export interface ConnectorImportRequest {
  connectorId: ConnectorId;
  sourceText: string;
  sourceName?: string;
}

export interface ConnectorImportResult extends ConnectorSettings {
  connectorId: ConnectorId;
  connectorLabel: string;
  rows: DatasetRow[];
}

const CONNECTORS: DataConnector[] = [
  {
    id: "google-sheets",
    label: "Google Sheets",
    category: "spreadsheet",
    status: "demo",
    description: "Paste public sheet CSV data or a mock Google Sheets URL."
  },
  {
    id: "onedrive-excel",
    label: "OneDrive Excel",
    category: "spreadsheet",
    status: "demo",
    description: "Preview Excel cloud imports using the same row pipeline."
  },
  {
    id: "database",
    label: "Database",
    category: "database",
    status: "planned",
    description: "Future SQL warehouse and app database connector."
  },
  {
    id: "crm",
    label: "CRM",
    category: "saas",
    status: "demo",
    description: "Preview account, opportunity, and revenue exports."
  },
  {
    id: "finance",
    label: "Finance",
    category: "saas",
    status: "planned",
    description: "Future finance system import for margin and cost data."
  },
  {
    id: "ads",
    label: "Ads",
    category: "saas",
    status: "planned",
    description: "Future campaign spend and conversion connector."
  },
  {
    id: "product-analytics",
    label: "Product Analytics",
    category: "saas",
    status: "planned",
    description: "Future product usage and funnel connector."
  }
];

const DEMO_ROWS: DatasetRow[] = [
  {
    "Order Date": "2026-04-01",
    Region: "East",
    Product: "Category C",
    "Sales Amount": 220000,
    "Gross Profit": 72000,
    Orders: 510,
    Customer: "Connected Account A"
  },
  {
    "Order Date": "2026-05-01",
    Region: "West",
    Product: "Category A",
    "Sales Amount": 180000,
    "Gross Profit": 54000,
    Orders: 470,
    Customer: "Connected Account B"
  },
  {
    "Order Date": "2026-06-01",
    Region: "East",
    Product: "Category B",
    "Sales Amount": 260000,
    "Gross Profit": 83000,
    Orders: 620,
    Customer: "Connected Account C"
  }
];

export function listDataConnectors(): DataConnector[] {
  return CONNECTORS.map((connector) => ({ ...connector }));
}

export function importConnectorRows({
  connectorId,
  sourceName,
  sourceText
}: ConnectorImportRequest): ConnectorImportResult {
  const connector = getConnector(connectorId);
  const trimmedSource = sourceText.trim();
  const rows = shouldUseDemoRows(trimmedSource) ? [...DEMO_ROWS] : parseCsvText(trimmedSource);

  if (!rows.length) {
    throw new Error("Connector source did not produce rows.");
  }

  return {
    connectorId,
    selectedConnectorId: connectorId,
    connectorLabel: connector.label,
    sourceName: sourceName?.trim() || defaultSourceName(connector),
    sourceText: trimmedSource,
    lastRefreshAt: new Date().toISOString(),
    rowCount: rows.length,
    rows
  };
}

export function refreshConnectorRows(settings: ConnectorSettings): ConnectorImportResult {
  return importConnectorRows({
    connectorId: settings.selectedConnectorId,
    sourceName: settings.sourceName,
    sourceText: settings.sourceText
  });
}

function getConnector(connectorId: ConnectorId): DataConnector {
  const connector = CONNECTORS.find((item) => item.id === connectorId);
  if (!connector) throw new Error(`Unsupported connector: ${connectorId}`);
  return connector;
}

function shouldUseDemoRows(sourceText: string): boolean {
  return !sourceText || /^https?:\/\//i.test(sourceText);
}

function defaultSourceName(connector: DataConnector): string {
  return `${connector.label} demo source`;
}
