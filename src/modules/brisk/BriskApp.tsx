import { Fragment, type CSSProperties, type DragEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GripVertical,
  Lightbulb,
  PanelLeft,
  Share2,
  Sparkles,
  Upload
} from "lucide-react";
import {
  analyzeDataset,
  buildDashboard,
  buildSemanticModel,
  checkAiProviderHealth,
  completeAiRequest,
  createConsultantResponse,
  createDashboardRecommendations,
  createExcelWorkbookHtml,
  createEvidencePackage,
  createPowerPointHtml,
  createValidatedAction,
  DEFAULT_PROJECT_ID,
  defaultPrivacySettings,
  exportDashboardPackage,
  importConnectorRows,
  loadProjectSnapshot,
  listAiProviders,
  listDataConnectors,
  makeShareUrl,
  refreshConnectorRows,
  saveProjectSnapshot,
  scoreChartSuitability,
  serializeRowsAsCsv,
  storeProviderSecret,
  type AiAuditEvent,
  type AiProviderId,
  type AiProviderConnection,
  type ChartKind,
  type ConnectorId,
  type ConnectorSettings,
  type ConsultantAction,
  type DashboardInsight,
  type DashboardInsightKey,
  type DatasetRow,
  type EvidenceSubject,
  type PrivacySettings,
  type ProjectSnapshot,
  type SemanticFieldOverride,
  type SemanticFieldRole
} from "./lib/brisk";
import { parseUploadedFile } from "./lib/fileParser";
import "./BriskApp.css";

type FlowStep = "upload" | "profile" | "recommendations" | "workspace" | "analysis" | "export";
type DashboardWidgetId =
  | "kpis"
  | "growth"
  | "trend"
  | "drivers"
  | "revenueProfit"
  | "productMix"
  | "margin"
  | "matrix"
  | "profitabilityGauge"
  | "revenueDistribution"
  | "revenueProfitScatter"
  | "aiProductDoughnut"
  | "risks"
  | "opportunities"
  | "regionalComparison"
  | "consultant";
type DashboardTab = { id: string; label: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; providerMeta?: string };
type DashboardBuilderChartType = "auto" | "bar" | "line" | "area" | "doughnut" | "scatter" | "gauge" | "table";
type DashboardBuilderSize = "third" | "half" | "wide" | "full";
type WidgetBuilderSettings = Partial<Record<DashboardWidgetId, { chartType?: DashboardBuilderChartType; size?: DashboardBuilderSize }>>;

type AppStep = FlowStep | "integrations" | "evidence" | "settings";

const defaultWidgetOrder: DashboardWidgetId[] = [
  "kpis",
  "growth",
  "drivers",
  "trend",
  "revenueProfit",
  "productMix",
  "margin",
  "profitabilityGauge",
  "revenueDistribution",
  "revenueProfitScatter",
  "matrix",
  "risks",
  "opportunities"
];

const dashboardWidgetIds = new Set<DashboardWidgetId>([
  ...defaultWidgetOrder,
  "regionalComparison",
  "aiProductDoughnut",
  "consultant"
]);

const chatSuggestions = ["Why did revenue drop in March?", "Which segment is strongest?", "Add a doughnut chart"];
const semanticRoleOptions: SemanticFieldRole[] = ["metric", "dimension", "date", "identifier", "target", "benchmark", "unknown"];
const builderChartTypes: DashboardBuilderChartType[] = ["auto", "bar", "line", "area", "doughnut", "scatter", "gauge", "table"];
const builderSizes: DashboardBuilderSize[] = ["third", "half", "wide", "full"];

const sampleRows: DatasetRow[] = [
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

const navItems = [
  { id: "upload", label: "Upload" },
  { id: "integrations", label: "Integrations" },
  { id: "profile", label: "Data Profile" },
  { id: "recommendations", label: "Recommendations" },
  { id: "workspace", label: "Dashboards" },
  { id: "analysis", label: "AI Consultant" },
  { id: "evidence", label: "Evidence" },
  { id: "export", label: "Exports" },
  { id: "settings", label: "Settings" }
] as const;

const flowOrder: AppStep[] = ["upload", "integrations", "profile", "recommendations", "workspace", "analysis", "evidence", "export", "settings"];

function App() {
  const [step, setStep] = useState<AppStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rows, setRows] = useState<DatasetRow[]>(sampleRows);
  const [fileName, setFileName] = useState("Sales_Data_Q2.xlsx");
  const [parseError, setParseError] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("Excel");
  const [connectorSettings, setConnectorSettings] = useState<ConnectorSettings>(defaultConnectorSettings());
  const [connectorSourceDraft, setConnectorSourceDraft] = useState(defaultConnectorSettings().sourceText);
  const [shareUrl, setShareUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>(defaultWidgetOrder);
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetId | null>(null);
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [dashboardName, setDashboardName] = useState("Executive Sales Performance Dashboard");
  const [dashboardTabs, setDashboardTabs] = useState<DashboardTab[]>([{ id: "overview", label: "Executive Overview" }]);
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");
  const [statusMessage, setStatusMessage] = useState("");
  const [isAutofit, setIsAutofit] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<DashboardWidgetId>("drivers");
  const [widgetBuilderSettings, setWidgetBuilderSettings] = useState<WidgetBuilderSettings>({});
  const [draftChartType, setDraftChartType] = useState<DashboardBuilderChartType>("auto");
  const [selectedFilterValue, setSelectedFilterValue] = useState("All");
  const [, setHideRawData] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [expiryEnabled, setExpiryEnabled] = useState(true);
  const [auditTrail, setAuditTrail] = useState<AiAuditEvent[]>([]);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(defaultPrivacySettings);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<DashboardInsightKey>("growth");
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<AiProviderId>("openai");
  const [customProviderEndpoint, setCustomProviderEndpoint] = useState("");
  const [customProviderApiKey, setCustomProviderApiKey] = useState("");
  const [semanticOverrides, setSemanticOverrides] = useState<SemanticFieldOverride[]>([]);
  const [isPersistenceLoaded, setIsPersistenceLoaded] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState("Persistence: loading");
  const [secretVaultStatus, setSecretVaultStatus] = useState("Secret vault: not stored");
  const [chatDraft, setChatDraft] = useState("");
  const [pendingConsultantAction, setPendingConsultantAction] = useState<ConsultantAction | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask about revenue, regions, margin, risks, or what to add to the dashboard."
    }
  ]);

  const profile = useMemo(() => analyzeDataset(rows, fileName, { semanticOverrides }), [rows, fileName, semanticOverrides]);
  const filterOptions = useMemo(() => {
    if (!profile.primaryDimension) return [];
    return Array.from(new Set(rows.map((row) => String(row[profile.primaryDimension ?? ""] ?? "")).filter(Boolean)));
  }, [profile.primaryDimension, rows]);
  const filteredRows = useMemo(() => {
    if (!profile.primaryDimension || selectedFilterValue === "All") return rows;
    return rows.filter((row) => String(row[profile.primaryDimension ?? ""] ?? "") === selectedFilterValue);
  }, [profile.primaryDimension, rows, selectedFilterValue]);
  const recommendations = useMemo(() => createDashboardRecommendations(profile), [profile]);
  const dashboard = useMemo(() => buildDashboard(profile, filteredRows), [profile, filteredRows]);
  const semanticModel = useMemo(() => buildSemanticModel(profile, rows, semanticOverrides), [profile, rows, semanticOverrides]);
  const evidencePackage = useMemo(() => createEvidencePackage({
    profile,
    dashboard,
    semanticModel,
    rows: filteredRows,
    auditTrail,
    privacySettings
  }), [auditTrail, dashboard, filteredRows, privacySettings, profile, semanticModel]);
  const selectedEvidenceSubject = evidencePackage.subjects.find((subject) => subject.id === selectedEvidenceId) ?? evidencePackage.subjects[0];
  const validation = useMemo(
    () => createValidatedAction(profile, "Why did revenue drop in March?"),
    [profile]
  );
  const exportPackage = useMemo(() => exportDashboardPackage(selectedFormat), [selectedFormat]);
  const aiProviders = useMemo(() => listAiProviders(), []);
  const dataConnectors = useMemo(() => listDataConnectors(), []);
  const customProviderConnection = useMemo<AiProviderConnection>(() => ({
    endpoint: customProviderEndpoint,
    apiKey: customProviderApiKey
  }), [customProviderApiKey, customProviderEndpoint]);
  const selectedProviderHealth = useMemo(
    () => checkAiProviderHealth(selectedProviderId, selectedProviderId === "custom-compatible" ? customProviderConnection : undefined),
    [customProviderConnection, selectedProviderId]
  );
  const currentRecommendation = recommendations[0];
  const selectedWidgetSettings = widgetBuilderSettings[selectedWidgetId] ?? {};
  const selectedChartType = selectedWidgetSettings.chartType ?? "auto";
  const selectedSuitability = useMemo(
    () => scoreChartSuitability({
      kind: chartTypeToKind(draftChartType === "auto" ? defaultChartTypeForWidget(selectedWidgetId) : draftChartType),
      profile,
      rows: filteredRows
    }),
    [draftChartType, filteredRows, profile, selectedWidgetId]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadProject() {
      const snapshot = await loadProjectSnapshot(DEFAULT_PROJECT_ID);
      if (!isMounted) return;

      if (snapshot) {
        setRows(snapshot.rows.length ? snapshot.rows : sampleRows);
        setFileName(snapshot.fileName || "Sales_Data_Q2.xlsx");
        setDashboardName(snapshot.dashboardName || "Executive Sales Performance Dashboard");
        setWidgetOrder(normalizeWidgetOrder(snapshot.widgetOrder));
        setDashboardTabs(snapshot.dashboardTabs.length ? snapshot.dashboardTabs : [{ id: "overview", label: "Executive Overview" }]);
        setActiveDashboardTab(snapshot.activeDashboardTab || "overview");
        setSelectedFormat(snapshot.selectedFormat || "Excel");
        setSemanticOverrides(snapshot.semanticOverrides ?? []);
        setSelectedWidgetId(normalizeWidgetId(snapshot.builderSettings?.selectedWidgetId));
        setSelectedFilterValue(snapshot.builderSettings?.selectedFilterValue || "All");
        setWidgetBuilderSettings(normalizeWidgetBuilderSettings(snapshot.builderSettings?.widgetSettings));
        setSelectedProviderId(snapshot.providerSettings.selectedProviderId);
        setCustomProviderEndpoint(snapshot.providerSettings.customProviderEndpoint);
        setAuditTrail(snapshot.auditTrail ?? []);
        setPrivacySettings({
          ...defaultPrivacySettings,
          ...(snapshot.privacySettings ?? {})
        });
        const loadedConnectorSettings = {
          ...defaultConnectorSettings(),
          ...(snapshot.connectorSettings ?? {})
        };
        setConnectorSettings(loadedConnectorSettings);
        setConnectorSourceDraft(loadedConnectorSettings.sourceText);
        setChatMessages(snapshot.chatMessages.length ? snapshot.chatMessages : [
          {
            id: "welcome",
            role: "assistant",
            content: "Ask about revenue, regions, margin, risks, or what to add to the dashboard."
          }
        ]);
        setPersistenceStatus("Persistence: loaded");
      } else {
        setPersistenceStatus("Persistence: ready");
      }

      setIsPersistenceLoaded(true);
    }

    void loadProject();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isPersistenceLoaded) return;
    let isMounted = true;
    const snapshot: ProjectSnapshot = {
      id: DEFAULT_PROJECT_ID,
      dashboardName,
      fileName,
      rows,
      widgetOrder,
      dashboardTabs,
      activeDashboardTab,
      selectedFormat,
      semanticOverrides,
      builderSettings: {
        selectedWidgetId,
        selectedFilterValue,
        widgetSettings: widgetBuilderSettings
      },
      providerSettings: {
        selectedProviderId,
        customProviderEndpoint
      },
      chatMessages,
      auditTrail,
      privacySettings,
      connectorSettings,
      updatedAt: new Date().toISOString()
    };

    async function saveProject() {
      const result = await saveProjectSnapshot(snapshot);
      if (!isMounted) return;
      setPersistenceStatus(result.mode === "api" ? "Persistence: saved to API" : "Persistence: saved locally");
    }

    void saveProject();

    return () => {
      isMounted = false;
    };
  }, [
    activeDashboardTab,
    auditTrail,
    chatMessages,
    connectorSettings,
    customProviderEndpoint,
    dashboardName,
    dashboardTabs,
    fileName,
    isPersistenceLoaded,
    rows,
    semanticOverrides,
    selectedFormat,
    selectedFilterValue,
    selectedProviderId,
    privacySettings,
    selectedWidgetId,
    widgetBuilderSettings,
    widgetOrder
  ]);

  useEffect(() => {
    let isMounted = true;

    if (selectedProviderId !== "custom-compatible") {
      setSecretVaultStatus("Secret vault: not stored");
      return;
    }

    if (!customProviderEndpoint || !customProviderApiKey) {
      setSecretVaultStatus("Secret vault: waiting for endpoint and key");
      return;
    }

    async function storeSecret() {
      const result = await storeProviderSecret({
        projectId: DEFAULT_PROJECT_ID,
        providerId: selectedProviderId,
        endpoint: customProviderEndpoint,
        apiKey: customProviderApiKey
      });
      if (!isMounted) return;
      setSecretVaultStatus(result.status === "stored" ? "Secret vault: stored in API memory" : "Secret vault: unavailable");
    }

    void storeSecret();

    return () => {
      isMounted = false;
    };
  }, [customProviderApiKey, customProviderEndpoint, selectedProviderId]);

  useEffect(() => {
    setDraftChartType(widgetBuilderSettings[selectedWidgetId]?.chartType ?? "auto");
  }, [selectedWidgetId, widgetBuilderSettings]);

  async function analyzeSelectedFile() {
    setParseError("");
    setIsParsing(true);
    try {
      if (selectedFile) {
        const parsedRows = await parseUploadedFile(selectedFile);
        if (parsedRows.length === 0) {
          throw new Error("No rows found in uploaded file.");
        }
        setRows(parsedRows);
        setFileName(selectedFile.name);
      }
      setStep("profile");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not parse file.");
    } finally {
      setIsParsing(false);
    }
  }

  function selectConnector(connectorId: ConnectorId) {
    setConnectorSettings((current) => ({
      ...current,
      selectedConnectorId: connectorId
    }));
    setStatusMessage(`${connectorLabel(connectorId, dataConnectors)} selected`);
  }

  function importConnectedData() {
    try {
      const result = importConnectorRows({
        connectorId: connectorSettings.selectedConnectorId,
        sourceName: connectorSettings.sourceName || undefined,
        sourceText: connectorSourceDraft
      });
      setRows(result.rows);
      setFileName(`connected-${result.connectorId}.csv`);
      setSelectedFile(null);
      setConnectorSettings({
        selectedConnectorId: result.connectorId,
        sourceName: result.sourceName,
        sourceText: result.sourceText,
        lastRefreshAt: result.lastRefreshAt,
        rowCount: result.rowCount
      });
      setConnectorSourceDraft(result.sourceText);
      setStatusMessage(`Connected data imported from ${result.connectorLabel}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Connector import failed");
    }
  }

  function refreshConnectedData() {
    try {
      const result = refreshConnectorRows({
        ...connectorSettings,
        sourceText: connectorSourceDraft
      });
      setRows(result.rows);
      setFileName(`connected-${result.connectorId}.csv`);
      setConnectorSettings({
        selectedConnectorId: result.connectorId,
        sourceName: result.sourceName,
        sourceText: result.sourceText,
        lastRefreshAt: result.lastRefreshAt,
        rowCount: result.rowCount
      });
      setStatusMessage(`${result.connectorLabel} refreshed`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Connector refresh failed");
    }
  }

  function downloadCsv() {
    downloadText(`${stripExtension(fileName)}-dashboard.csv`, serializeRowsAsCsv(rows), "text/csv");
  }

  function downloadExcel() {
    const workbook = createExcelWorkbookHtml({
      dashboardName,
      dashboard,
      evidencePackage,
      profile,
      privacySettings,
      rows
    });
    downloadText(`${stripExtension(fileName)}-brisk-workbook.xls`, workbook, "application/vnd.ms-excel");
    setStatusMessage("Branded Excel workbook downloaded");
  }

  function downloadPdf() {
    setStatusMessage("Print-ready PDF view opened");
    if (!navigator.userAgent.includes("jsdom")) {
      window.print();
    }
  }

  function downloadPowerPoint() {
    const deck = createPowerPointHtml({
      dashboardName,
      dashboard,
      evidencePackage,
      profile,
      privacySettings,
      rows
    });
    downloadText(`${stripExtension(fileName)}-brisk-deck.ppt`, deck, "application/vnd.ms-powerpoint");
    setStatusMessage("PowerPoint package downloaded");
  }

  function createShareLink() {
    const url = makeShareUrl(profile, {
      dashboardName,
      hideRawData: privacySettings.hideRawData,
      passwordEnabled,
      expiryEnabled,
      readOnly: true
    });
    setShareUrl(url);
    setStatusMessage("Share link copied");
    void navigator.clipboard?.writeText(url);
  }

  function goToStep(nextStep: AppStep) {
    setStatusMessage("");
    setStep(nextStep);
  }

  function openEvidenceDrawer(evidenceId: DashboardInsightKey) {
    setSelectedEvidenceId(evidenceId);
    setIsEvidenceDrawerOpen(true);
  }

  function updatePrivacySetting(key: keyof PrivacySettings, value: boolean) {
    setPrivacySettings((current) => ({
      ...current,
      [key]: value
    }));
    if (key === "hideRawData") setHideRawData(value);
    setStatusMessage("Privacy control updated");
  }

  function downloadEvidenceJson() {
    if (!privacySettings.includeEvidencePackage) {
      setStatusMessage("Evidence package excluded by privacy controls");
      return;
    }
    downloadText(
      `${stripExtension(fileName)}-evidence-package.json`,
      JSON.stringify(evidencePackage, null, 2),
      "application/json"
    );
    setStatusMessage("Evidence package downloaded");
  }

  function moveStep(direction: -1 | 1) {
    const currentIndex = flowOrder.indexOf(step);
    const nextStep = flowOrder[currentIndex + direction];
    if (nextStep) goToStep(nextStep);
  }

  function addAnalysisTab(message = "March Drop Drivers added") {
    setDashboardTabs((tabs) =>
      tabs.some((tab) => tab.id === "march-drop")
        ? tabs
        : [...tabs, { id: "march-drop", label: "March Drop Drivers" }]
    );
    setActiveDashboardTab("march-drop");
    setStatusMessage(message);
  }

  async function askAiConsultant(question: string) {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    const consultantResponse = createConsultantResponse({
      question: trimmedQuestion,
      profile,
      dashboard,
      semanticModel
    });
    const consultantAnswer = formatConsultantAnswer(consultantResponse.answer, consultantResponse.confidence, consultantResponse.caveats);
    const aiResponse = await completeAiRequest({
      providerId: selectedProviderId,
      fallbackProviderId: "local-compatible",
      task: "dashboard-chat",
      prompt: trimmedQuestion,
      fallbackText: consultantAnswer,
      customConnection: selectedProviderId === "custom-compatible" ? customProviderConnection : undefined
    });
    const auditEvent: AiAuditEvent = {
      id: `audit-${Date.now()}-${auditTrail.length}`,
      timestamp: new Date().toISOString(),
      question: trimmedQuestion,
      providerLabel: aiResponse.provider.label,
      model: aiResponse.model,
      actionTitle: consultantResponse.proposedActions[0]?.title ?? "Chat response",
      status: consultantResponse.proposedActions[0] ? "proposed" : "answered",
      evidenceFields: consultantResponse.evidence.map((item) => item.fieldName)
    };
    setChatMessages((messages) => [
      ...messages,
      { id: `user-${Date.now()}-${messages.length}`, role: "user", content: `You: ${trimmedQuestion}` },
      {
        id: `assistant-${Date.now()}-${messages.length}`,
        role: "assistant",
        content: aiResponse.content,
        providerMeta: `${aiResponse.provider.label} · ${aiResponse.model}`
      }
    ]);
    setAuditTrail((events) => [...events, auditEvent]);
    setPendingConsultantAction(consultantResponse.proposedActions[0] ?? null);
    setChatDraft("");
  }

  function applyConsultantAction(action: ConsultantAction) {
    if (action.status !== "passed") {
      setStatusMessage("Action blocked by validation");
      return;
    }

    if (action.type === "add_chart") {
      const widgetId = action.payload.widgetId as DashboardWidgetId;
      if (dashboardWidgetIds.has(widgetId)) {
        setWidgetOrder((current) => current.includes(widgetId) ? current : [...current, widgetId]);
        setStatusMessage(`${action.title} applied`);
      }
    }

    if (action.type === "remove_chart") {
      const widgetId = action.payload.widgetId as DashboardWidgetId;
      setWidgetOrder((current) => current.filter((widget) => widget !== widgetId));
      setStatusMessage(`${action.title} applied`);
    }

    if (action.type === "resize_chart") {
      setIsAutofit(true);
      setStatusMessage("Autofit dashboard applied");
    }

    if (action.type === "rename_dashboard") {
      setDashboardName(String(action.payload.name));
      setStatusMessage("Dashboard renamed");
    }

    if (action.type === "create_tab") {
      const tabId = String(action.payload.tabId);
      const label = String(action.payload.label);
      setDashboardTabs((tabs) => tabs.some((tab) => tab.id === tabId) ? tabs : [...tabs, { id: tabId, label }]);
      setActiveDashboardTab(tabId);
      setStatusMessage("Consultant view created");
    }

    if (action.type === "explain_insight") {
      goToStep("evidence");
      setStatusMessage("Evidence opened");
    }

    if (action.type === "export_summary") {
      setSelectedFormat(String(action.payload.format || "Share Link"));
      goToStep("export");
      setStatusMessage("Export summary prepared");
    }

    setAuditTrail((events) => [
      ...events,
      {
        id: `audit-${Date.now()}-${events.length}`,
        timestamp: new Date().toISOString(),
        question: "Applied AI action",
        providerLabel: "Brisk validation",
        model: "deterministic-action-audit",
        actionTitle: action.title,
        status: "applied",
        evidenceFields: action.evidence.map((item) => item.fieldName)
      }
    ]);
    setPendingConsultantAction(null);
  }

  function toggleAutofit() {
    setIsAutofit((current) => {
      const next = !current;
      setStatusMessage(next ? "Autofit layout on" : "Autofit layout off");
      return next;
    });
  }

  function updateSemanticRole(fieldName: string, role: SemanticFieldRole) {
    setSemanticOverrides((current) => {
      const next = current.filter((override) => override.fieldName !== fieldName);
      return [...next, { fieldName, role }];
    });
    setStatusMessage(`${fieldName} role set to ${role}`);
  }

  function updateDashboardFilter(value: string) {
    setSelectedFilterValue(value);
    setStatusMessage(value === "All" ? "Filter cleared" : `Filter applied: ${value}`);
  }

  function updateWidgetChartType(widgetId: DashboardWidgetId, chartType: DashboardBuilderChartType) {
    const suitability = scoreChartSuitability({
      kind: chartTypeToKind(chartType === "auto" ? defaultChartTypeForWidget(widgetId) : chartType),
      profile,
      rows: filteredRows
    });
    if (suitability.status === "blocked") {
      setStatusMessage(`Chart blocked: ${suitability.reason}`);
      return;
    }
    setWidgetBuilderSettings((current) => ({
      ...current,
      [widgetId]: {
        ...current[widgetId],
        chartType
      }
    }));
    setStatusMessage(`${getWidgetTitle(widgetId)} chart type set to ${chartType}`);
  }

  function updateWidgetSize(widgetId: DashboardWidgetId, size: DashboardBuilderSize) {
    setWidgetBuilderSettings((current) => ({
      ...current,
      [widgetId]: {
        ...current[widgetId],
        size
      }
    }));
    setStatusMessage(`${getWidgetTitle(widgetId)} resized to ${size}`);
  }

  function widgetClass(widgetId: DashboardWidgetId, defaultClassName: string) {
    const size = widgetBuilderSettings[widgetId]?.size;
    return size ? `widget-${size}` : defaultClassName;
  }

  function chartTypeFor(widgetId: DashboardWidgetId, defaultType: DashboardBuilderChartType = "auto") {
    return widgetBuilderSettings[widgetId]?.chartType ?? defaultType;
  }

  function renderFlexibleChart(
    widgetId: DashboardWidgetId,
    points: Array<{ label: string; value: number }>,
    defaultType: DashboardBuilderChartType,
    suffix = ""
  ) {
    const chartType = chartTypeFor(widgetId, defaultType);
    if (chartType === "line") return <LineChart points={points} />;
    if (chartType === "area") return <AreaChart points={points} />;
    if (chartType === "doughnut") return <DoughnutChart points={points} />;
    if (chartType === "scatter") return <ScatterPlot points={points.map((point) => ({ label: point.label, primary: point.value, secondary: point.value }))} />;
    if (chartType === "gauge") return <GaugeChart value={points[0]?.value ?? 0} label={points[0]?.label ?? "Value"} />;
    if (chartType === "table") return <PointTable points={points} suffix={suffix} />;
    return <BarList points={points} suffix={suffix} />;
  }

  function moveWidget(widgetId: DashboardWidgetId, direction: -1 | 1) {
    setWidgetOrder((current) => {
      const index = current.indexOf(widgetId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function dropWidget(targetWidget: DashboardWidgetId) {
    if (!draggedWidget || draggedWidget === targetWidget) return;
    setWidgetOrder((current) => {
      const withoutDragged = current.filter((widget) => widget !== draggedWidget);
      const targetIndex = withoutDragged.indexOf(targetWidget);
      if (targetIndex < 0) return current;
      const next = [...withoutDragged];
      next.splice(targetIndex, 0, draggedWidget);
      return next;
    });
    setDraggedWidget(null);
  }

  function renderDashboardWidget(widgetId: DashboardWidgetId) {
    switch (widgetId) {
      case "kpis":
        return (
          <DashboardWidget
            id={widgetId}
            title="Performance snapshot"
            className={widgetClass(widgetId, "widget-kpis")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <div className="metric-strip">
              {dashboard.kpis.map((kpi) => (
                <Metric key={kpi.label} label={kpi.label} value={kpi.value} />
              ))}
            </div>
          </DashboardWidget>
        );
      case "trend":
        return (
          <DashboardWidget
            id={widgetId}
            title="Revenue trend"
            className={widgetClass(widgetId, "widget-wide")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.growth} evidenceId="growth" onOpenEvidence={openEvidenceDrawer}>
              <AreaChart points={dashboard.trend.length ? dashboard.trend : dashboard.driverBreakdown} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "growth":
        return (
          <DashboardWidget
            id={widgetId}
            title="Revenue Growth"
            className={widgetClass(widgetId, "widget-wide")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.growth} evidenceId="growth" onOpenEvidence={openEvidenceDrawer}>
              <GrowthPanel points={dashboard.trend} summary={dashboard.growthSummary} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "drivers":
        return (
          <DashboardWidget
            id={widgetId}
            title="Regional Performance"
            className={widgetClass(widgetId, "widget-half")}
            confidence={dashboard.insights.regional.confidence}
            isSelected={selectedWidgetId === widgetId}
            onMove={moveWidget}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.regional} evidenceId="regional" onOpenEvidence={openEvidenceDrawer}>
              {renderFlexibleChart(widgetId, dashboard.driverBreakdown, "bar")}
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "revenueProfit":
        return (
          <DashboardWidget
            id={widgetId}
            title="Revenue vs Profit"
            className={widgetClass(widgetId, "widget-wide")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.revenueProfit} evidenceId="revenueProfit" onOpenEvidence={openEvidenceDrawer}>
              <GroupedBars points={dashboard.revenueVsProfit} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "productMix":
        return (
          <DashboardWidget
            id={widgetId}
            title="Product Mix"
            className={widgetClass(widgetId, "widget-wide")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.productMix} evidenceId="productMix" compact onOpenEvidence={openEvidenceDrawer}>
              <div className="composition-grid">
                <DoughnutChart points={dashboard.productMix} />
                <ShareList points={dashboard.productMix} />
              </div>
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "profitabilityGauge":
        return (
          <DashboardWidget
            id={widgetId}
            title="Profitability Gauge"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.margin} evidenceId="margin" compact onOpenEvidence={openEvidenceDrawer}>
              <GaugeChart value={parsePercent(dashboard.kpis.find((kpi) => kpi.label === "Gross Margin")?.value)} label="Gross margin" />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "revenueDistribution":
        return (
          <DashboardWidget
            id={widgetId}
            title="Revenue Distribution"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.distribution} evidenceId="distribution" compact onOpenEvidence={openEvidenceDrawer}>
              <HistogramChart points={dashboard.trend.length ? dashboard.trend : dashboard.driverBreakdown} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "revenueProfitScatter":
        return (
          <DashboardWidget
            id={widgetId}
            title="Revenue Profit Scatter"
            className={widgetClass(widgetId, "widget-wide")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.scatter} evidenceId="scatter" onOpenEvidence={openEvidenceDrawer}>
              <ScatterPlot points={dashboard.revenueVsProfit} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "margin":
        return (
          <DashboardWidget
            id={widgetId}
            title="Margin by Region"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.margin} evidenceId="margin" compact onOpenEvidence={openEvidenceDrawer}>
              <BarList points={dashboard.marginByDimension} suffix="%" />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "matrix":
        return (
          <DashboardWidget
            id={widgetId}
            title="Top Driver Matrix"
            className={widgetClass(widgetId, "widget-wide")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.matrix} evidenceId="matrix" onOpenEvidence={openEvidenceDrawer}>
              <DriverMatrix rows={dashboard.driverMatrix} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "regionalComparison":
        return (
          <DashboardWidget
            id={widgetId}
            title="Regional Sales Comparison"
            className={widgetClass(widgetId, "widget-half")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.regional} evidenceId="regional" onOpenEvidence={openEvidenceDrawer}>
              <BarList points={dashboard.driverBreakdown} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "aiProductDoughnut":
        return (
          <DashboardWidget
            id={widgetId}
            title="AI Product Doughnut"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ChartWithInsight insight={dashboard.insights.productMix} evidenceId="productMix" compact onOpenEvidence={openEvidenceDrawer}>
              <DoughnutChart points={dashboard.productMix} />
            </ChartWithInsight>
          </DashboardWidget>
        );
      case "risks":
        return (
          <DashboardWidget
            id={widgetId}
            title="Risks"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ul>{dashboard.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </DashboardWidget>
        );
      case "opportunities":
        return (
          <DashboardWidget
            id={widgetId}
            title="Opportunities"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <ul>{dashboard.opportunities.map((item) => <li key={item}>{item}</li>)}</ul>
          </DashboardWidget>
        );
      case "consultant":
        return (
          <DashboardWidget
            id={widgetId}
            title="AI Consultant"
            className={widgetClass(widgetId, "widget-third")}
            onMove={moveWidget}
            isSelected={selectedWidgetId === widgetId}
            onSelect={setSelectedWidgetId}
            onDragStart={setDraggedWidget}
            onDrop={dropWidget}
          >
            <div className="prompt-stack">
              <button className="ghost-button full" type="button" onClick={() => goToStep("analysis")}>
                Why did revenue drop in March?
              </button>
              <button className="ghost-button full" type="button" onClick={() => goToStep("analysis")}>
                Which segment is strongest?
              </button>
              <button className="ghost-button full" type="button" onClick={() => goToStep("analysis")}>
                Add a margin view
              </button>
            </div>
          </DashboardWidget>
        );
    }
  }

  const completedSteps = new Set<AppStep>(flowOrder.slice(0, Math.max(0, flowOrder.indexOf(step))));

  const activeNavLabel =
    step === "profile"
      ? "Data Profile"
      : step === "integrations"
        ? "Integrations"
      : step === "analysis"
        ? "AI Consultant"
        : step === "evidence"
          ? "Evidence"
          : step === "settings"
            ? "Settings"
            : step === "export"
              ? "Exports"
              : step === "workspace"
                ? "Dashboards"
                : step === "recommendations"
                  ? "Recommendations"
                  : "Upload";

  return (
    <div className={`app-shell ${isNavCollapsed ? "nav-collapsed" : ""}`}>
      <aside className="side-nav" aria-label="Primary">
        <div className="brand-block">
          <div className="brand-mark">
            <Sparkles size={16} />
          </div>
          <div className="brand-copy">
            <p className="eyebrow">SELISE Brisk a5</p>
            <h1>AI dashboard consultant</h1>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item, index) => {
            const isActive = item.label === activeNavLabel;
            const isComplete = completedSteps.has(item.id);
            return (
              <button
                key={`${item.label}-${index}`}
                type="button"
                className={`nav-item ${isActive ? "active" : ""} ${isComplete ? "complete" : ""}`}
                onClick={() => goToStep(item.id)}
              >
                <span className="nav-status">
                  {isComplete ? <CheckCircle2 size={14} /> : <span className="nav-dot" />}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-footer">
          <div className="workspace-chip">
            <FileSpreadsheet size={16} />
            <span>{fileName}</span>
          </div>
          <button className="ghost-button" type="button" onClick={() => setIsNavCollapsed((collapsed) => !collapsed)}>
            <PanelLeft size={16} />
            {isNavCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Executive workspace</p>
            <div className="topbar-title">{titleForStep(step)}</div>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" type="button" onClick={() => goToStep("workspace")}>
              <BarChart3 size={16} />
              Dashboard
            </button>
            <button className="primary-button" type="button" onClick={() => goToStep("export")}>
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className={`main-stage ${step === "workspace" || step === "analysis" || step === "evidence" || step === "settings" ? "wide" : ""}`}>
            {step === "upload" && (
              <ScreenCard tone="upload" title="Upload business data" icon={<Upload size={18} />}>
                <div className="upload-zone">
                  <label className="file-drop">
                    <input
                      aria-label="Upload Excel or CSV file"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(event) => {
                        setParseError("");
                        setSelectedFile(event.target.files?.[0] ?? null);
                      }}
                    />
                    <span className="upload-title">Drop Excel workbook here</span>
                    <span className="muted">Supports .xlsx, .xls, and .csv</span>
                    <span className="selected-file">{selectedFile?.name ?? "Using bundled sample until a file is selected"}</span>
                  </label>

                  <div className="checklist">
                    <ChecklistItem>Multi-sheet Excel parsing</ChecklistItem>
                    <ChecklistItem>Column type detection</ChecklistItem>
                    <ChecklistItem>Data quality scoring</ChecklistItem>
                    <ChecklistItem>Domain detection</ChecklistItem>
                    <ChecklistItem>Dashboard recommendations</ChecklistItem>
                    <ChecklistItem>Excel, CSV, PDF, and share outputs</ChecklistItem>
                  </div>

                  <label className="context-field">
                    <span>Business context</span>
                    <input defaultValue="Q2 performance review for the sales leadership team" />
                  </label>

                  {parseError ? <p className="error-text">{parseError}</p> : null}

                  <button className="primary-button" type="button" onClick={analyzeSelectedFile} disabled={isParsing}>
                    {isParsing ? "Analyzing..." : "Analyze Data"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </ScreenCard>
            )}

            {step === "integrations" && (
              <ScreenCard tone="integrations" title="Integrations" icon={<FileSpreadsheet size={18} />}>
                <div className="connector-layout">
                  <div className="connector-grid">
                    {dataConnectors.map((connector) => (
                      <article
                        className={`connector-card ${connectorSettings.selectedConnectorId === connector.id ? "selected" : ""}`}
                        key={connector.id}
                      >
                        <div className="card-head">
                          <h3>{connector.label}</h3>
                          <span className="chip">{connector.status}</span>
                        </div>
                        <p>{connector.description}</p>
                        <small>{connector.category}</small>
                        <button className="ghost-button full" type="button" onClick={() => selectConnector(connector.id)}>
                          Use {connector.label}
                        </button>
                      </article>
                    ))}
                  </div>
                  <aside className="connector-panel">
                    <h3>Connector source</h3>
                    <p className="muted">Paste CSV from a sheet/export, or paste a mock URL to use demo connector rows.</p>
                    <label className="context-field">
                      <span>Source name</span>
                      <input
                        value={connectorSettings.sourceName}
                        onChange={(event) => setConnectorSettings((current) => ({ ...current, sourceName: event.target.value }))}
                      />
                    </label>
                    <label className="context-field">
                      <span>Connector data</span>
                      <textarea
                        value={connectorSourceDraft}
                        onChange={(event) => setConnectorSourceDraft(event.target.value)}
                      />
                    </label>
                    <div className="connector-stats">
                      <Metric label="Rows imported" value={connectorSettings.rowCount ? connectorSettings.rowCount.toLocaleString() : "0"} />
                      <Metric label="Last refresh" value={connectorSettings.lastRefreshAt ? new Date(connectorSettings.lastRefreshAt).toLocaleString() : "Never"} />
                    </div>
                    <div className="action-row">
                      <button className="primary-button" type="button" onClick={importConnectedData}>
                        Import connected data
                      </button>
                      <button className="ghost-button" type="button" onClick={refreshConnectedData}>
                        Refresh data
                      </button>
                    </div>
                    {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
                  </aside>
                </div>
              </ScreenCard>
            )}

            {step === "profile" && (
              <ScreenCard tone="profile" title="AI Data Understanding" icon={<Sparkles size={18} />}>
                <div className="profile-summary">
                  <Metric label="Rows" value={profile.rowCount.toLocaleString()} />
                  <Metric label="Columns" value={String(profile.columnCount)} />
                  <Metric label="Domain" value={profile.domain.name} />
                  <Metric label="Confidence" value={`${profile.domain.confidence}%`} />
                  <Metric label="Quality" value={`${profile.qualityScore}%`} />
                  <Metric label="Readiness" value={`${profile.readinessScore}%`} />
                </div>

                <div className="dual-panel">
                  <div className="info-panel">
                    <h3>Detected file profile</h3>
                    <dl className="facts">
                      <Fact label="File" value={profile.fileName} />
                      <Fact label="Primary metric" value={profile.revenueField ?? "Not found"} />
                      <Fact label="Primary dimension" value={profile.primaryDimension ?? "Not found"} />
                      <Fact label="Missing field" value={profile.missingFields[0] ?? "None"} />
                    </dl>
                  </div>
                  <div className="info-panel">
                    <h3>Column profiling</h3>
                    <ul className="column-list">
                      {profile.columns.map((column) => (
                        <li key={column.name}>
                          <span>{column.name}</span>
                          <span>{column.type}</span>
                          <select
                            aria-label={`Semantic role for ${column.name}`}
                            value={column.role}
                            onChange={(event) => updateSemanticRole(column.name, event.target.value as SemanticFieldRole)}
                          >
                            {semanticRoleOptions.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="semantic-layer-panel">
                  <div className="semantic-section">
                    <h3>Semantic aliases</h3>
                    <div className="semantic-list">
                      {semanticModel.aliases.slice(0, 8).map((alias) => (
                        <div className="semantic-row" key={`${alias.fieldName}-${alias.alias}`}>
                          <span>{alias.fieldName}</span>
                          <strong>{alias.alias}</strong>
                          <small>{alias.source === "user" ? "user corrected" : `${alias.confidence}%`}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="semantic-section">
                    <h3>Semantic formulas</h3>
                    <div className="formula-grid">
                      {semanticModel.formulas.map((formula) => (
                        <div className={`formula-card ${formula.available ? "available" : "blocked"}`} key={formula.id}>
                          <strong>{formula.label}</strong>
                          <span>{formula.expression}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="semantic-section">
                    <h3>Warnings and evidence</h3>
                    <ul className="semantic-evidence">
                      {semanticModel.warnings.slice(0, 3).map((warning) => (
                        <li key={warning.id}>{warning.message}</li>
                      ))}
                      {semanticModel.evidenceReferences.slice(0, 3).map((evidence) => (
                        <li key={`${evidence.fieldName}-${evidence.source}`}>{evidence.reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {statusMessage ? <p className="status-text">{statusMessage}</p> : null}

                <button className="primary-button" type="button" onClick={() => goToStep("recommendations")}>
                  View Recommended Dashboards
                  <ArrowRight size={16} />
                </button>
                <span className="chip warning">{profile.domain.name}</span>
              </ScreenCard>
            )}

            {step === "recommendations" && currentRecommendation && (
              <ScreenCard tone="recommendations" title="Recommended dashboards" icon={<Lightbulb size={18} />}>
                <div className="recommendations-layout">
                  <div className="recommendation-list">
                    {recommendations.map((item, index) => (
                      <article key={item.name} className={`recommendation-card ${index === 0 ? "selected" : ""}`}>
                        <div className="card-head">
                          <h3>{item.name}</h3>
                          <span className="chip">{item.confidence}%</span>
                        </div>
                        <p>{item.audience}</p>
                        <ul>
                          {item.kpis.map((kpi) => (
                            <li key={kpi}>{kpi}</li>
                          ))}
                        </ul>
                        <small>{item.limitations.join(" • ")}</small>
                      </article>
                    ))}
                  </div>

                  <aside className="insight-panel">
                    <h3>Why this fits</h3>
                    <p>{currentRecommendation.audience}</p>
                    <div className="mini-grid">
                      <span>{profile.domain.name}</span>
                      <span>{profile.readinessScore}% readiness</span>
                      <span>{profile.revenueField ?? "Metric"} + {profile.primaryDimension ?? "dimension"}</span>
                    </div>
                    <button className="primary-button" type="button" onClick={() => goToStep("workspace")}>
                      Create Dashboard
                      <ArrowRight size={16} />
                    </button>
                  </aside>
                </div>
              </ScreenCard>
            )}

            {step === "workspace" && (
              <ScreenCard tone="workspace" title={dashboardName} icon={<BarChart3 size={18} />}>
                <div className="workspace-header">
                  <div className="dashboard-name-block">
                    <p className="muted">AI Consultant</p>
                    <label className="context-field compact">
                      <span>Dashboard name</span>
                      <input value={dashboardName} onChange={(event) => setDashboardName(event.target.value)} />
                    </label>
                  </div>
                  <div className="toolbar">
                    <button className="ghost-button" type="button" onClick={createShareLink}>
                      <Share2 size={16} />
                      Share
                    </button>
                    <button className={`ghost-button ${isAutofit ? "selected" : ""}`} type="button" onClick={toggleAutofit}>
                      Autofit layout
                    </button>
                    <button className="primary-button" type="button" onClick={() => goToStep("analysis")}>
                      Open AI Consultant
                    </button>
                  </div>
                </div>
                <div className="tab-row" role="tablist" aria-label="Dashboard tabs">
                  {dashboardTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`tab-button ${activeDashboardTab === tab.id ? "selected" : ""}`}
                      onClick={() => setActiveDashboardTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {statusMessage ? <p className="status-text">{statusMessage}</p> : null}

                <div className="dashboard-workspace-grid">
                  <div className={`dashboard-canvas ${isAutofit ? "auto-fit" : ""}`} aria-label="Movable dashboard widgets">
                    {widgetOrder.map((widgetId) => (
                      <Fragment key={widgetId}>
                        {renderDashboardWidget(widgetId)}
                      </Fragment>
                    ))}
                  </div>
                  <div className="builder-side-stack">
                    <DashboardBuilderPanel
                      chartType={draftChartType}
                      filterField={profile.primaryDimension}
                      filterOptions={filterOptions}
                      filterValue={selectedFilterValue}
                      isAutofit={isAutofit}
                      rowsInView={filteredRows.length}
                      selectedChartType={selectedChartType}
                      suitability={selectedSuitability}
                      selectedWidgetId={selectedWidgetId}
                      selectedWidgetSize={selectedWidgetSettings.size ?? inferWidgetSize(selectedWidgetId)}
                      widgetOrder={widgetOrder}
                      whyText={getWidgetWhy(selectedWidgetId, dashboard)}
                      onApplyChartType={() => updateWidgetChartType(selectedWidgetId, draftChartType)}
                      onChartTypeChange={setDraftChartType}
                      onFilterChange={updateDashboardFilter}
                      onSelectWidget={setSelectedWidgetId}
                      onSizeChange={(size) => updateWidgetSize(selectedWidgetId, size)}
                      onToggleAutofit={toggleAutofit}
                    />
                    <AIChatPanel
                      draft={chatDraft}
                      messages={chatMessages}
                      pendingAction={pendingConsultantAction}
                      onApplyAction={applyConsultantAction}
                      onDismissAction={() => setPendingConsultantAction(null)}
                      onAsk={askAiConsultant}
                      onDraftChange={setChatDraft}
                    />
                  </div>
                </div>
                {isEvidenceDrawerOpen && selectedEvidenceSubject ? (
                  <EvidenceDrawer
                    subject={selectedEvidenceSubject}
                    formulas={evidencePackage.formulas}
                    onClose={() => setIsEvidenceDrawerOpen(false)}
                  />
                ) : null}
              </ScreenCard>
            )}

            {step === "analysis" && (
              <ScreenCard tone="analysis" title={validation.title} icon={<Sparkles size={18} />}>
                <div className="analysis-layout">
                  <div className="analysis-main">
                    <div className="question-bubble">Why did revenue drop in March?</div>
                    <div className="explanation">
                      <p>
                        Brisk checked the uploaded data and found the largest driver in{" "}
                        {dashboard.driverBreakdown[0]?.label ?? "the top segment"}. The proposed chart uses only
                        detected fields and can be added without changing source data.
                      </p>
                    </div>
                    <div className="validation">
                      <h3>Validation</h3>
                      <span className={`chip ${validation.status === "passed" ? "success" : "warning"}`}>
                        Validation {validation.status}
                      </span>
                      <ul>
                        {validation.checks.map((check) => (
                          <li key={check.name}>{check.name}: {check.passed ? "passed" : "failed"}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <aside className="evidence-panel">
                    <h3>Evidence</h3>
                    <p>March revenue drop evidence</p>
                    <ul>
                      {dashboard.evidence.map((item) => (
                        <li key={item.label}>{item.label}: {item.value}</li>
                      ))}
                    </ul>
                    <div className="action-row">
                      <button className="primary-button" type="button" onClick={() => addAnalysisTab()}>
                        Add to Dashboard
                      </button>
                      <button className="ghost-button" type="button" onClick={() => {
                        addAnalysisTab("March Drop Drivers tab created");
                        goToStep("workspace");
                      }}>
                        Create New Tab
                      </button>
                    </div>
                    {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
                  </aside>
                </div>
              </ScreenCard>
            )}

            {step === "evidence" && (
              <ScreenCard tone="evidence" title="Evidence" icon={<Sparkles size={18} />}>
                <div className="evidence-cockpit">
                  <div className="info-panel">
                    <h3>Source trace</h3>
                    <dl className="facts">
                      {dashboard.evidence.map((item) => (
                        <Fact key={item.label} label={item.label} value={item.value} />
                      ))}
                    </dl>
                  </div>
                  <div className="info-panel">
                    <h3>Formula display</h3>
                    <div className="formula-list">
                      {evidencePackage.formulas.map((formula) => (
                        <div className="formula-line" key={formula.id}>
                          <strong>{formula.label}</strong>
                          <span>{formula.expression}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="info-panel">
                    <h3>Assumption log</h3>
                    <ul>
                      {evidencePackage.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="info-panel">
                    <h3>Source row preview</h3>
                    <SourceRows rows={evidencePackage.rowPreview} />
                  </div>
                  <div className="info-panel wide-panel">
                    <h3>AI action audit trail</h3>
                    <AuditTrail events={evidencePackage.auditTrail} />
                    <button className="primary-button" type="button" onClick={() => goToStep("analysis")}>
                      Open AI Consultant
                    </button>
                  </div>
                </div>
              </ScreenCard>
            )}

            {step === "export" && (
              <ScreenCard tone="export" title="Export and share dashboard" icon={<Download size={18} />}>
                <div className="export-layout">
                  <div className="export-options">
                    <h3>Output format</h3>
                    {["Excel", "CSV", "PDF", "Share Link", "PowerPoint"].map((format) => (
                      <button
                        key={format}
                        type="button"
                        aria-label={format === "PowerPoint" ? "PowerPoint P1" : undefined}
                        className={`format-pill ${selectedFormat === format ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedFormat(format);
                          if (format === "PDF") downloadPdf();
                          if (format === "Share Link") createShareLink();
                        }}
                      >
                        {format}
                        {format === "PowerPoint" ? <span className="tag">P1</span> : null}
                      </button>
                    ))}
                    <button className="primary-button full" type="button" onClick={downloadExcel}>
                      Download Excel
                    </button>
                    <button className="ghost-button full" type="button" onClick={downloadPdf}>
                      Download PDF
                    </button>
                    <button className="ghost-button full" type="button" onClick={downloadPowerPoint}>
                      Download PowerPoint
                    </button>
                    <button className="ghost-button full" type="button" onClick={downloadCsv}>
                      Download CSV
                    </button>
                    <button className="ghost-button full" type="button" onClick={createShareLink}>
                      Copy Share Link
                    </button>
                    <button className="ghost-button full" type="button" onClick={downloadEvidenceJson}>
                      Download Evidence JSON
                    </button>
                  </div>
                  <div className="export-summary">
                    <p className="muted">Current package</p>
                    <h3>{exportPackage.version}</h3>
                    <div className="branded-export-card">
                      <strong>Branded SELISE Brisk a5 template</strong>
                      <span>Read-only shared dashboard</span>
                      <small>Executive summary, KPIs, insight notes, and evidence appendix.</small>
                    </div>
                    <ul>
                      {exportPackage.includes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="share-controls">
                      <span className="chip">{privacySettings.hideRawData ? "Hide raw data" : "Raw data visible"}</span>
                      <span className="chip">{privacySettings.includeEvidencePackage ? "Evidence included" : "Evidence excluded"}</span>
                      <span className="chip">Password {passwordEnabled ? "on" : "off"}</span>
                      <span className="chip">Expiry {expiryEnabled ? "set" : "off"}</span>
                    </div>
                    {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
                    {shareUrl ? <input className="share-link" readOnly value={shareUrl} aria-label="Share link" /> : null}
                  </div>
                </div>
              </ScreenCard>
            )}

            {step === "settings" && (
              <ScreenCard tone="settings" title="Settings" icon={<PanelLeft size={18} />}>
                <div className="settings-grid">
                  <label className="context-field">
                    <span>AI model provider</span>
                    <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value as AiProviderId)}>
                      {aiProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="status-text">Provider status: {selectedProviderHealth.status}</p>
                  <p className="status-text">{persistenceStatus}</p>
                  <p className="status-text">{secretVaultStatus}</p>
                  {selectedProviderId === "custom-compatible" ? (
                    <>
                      <label className="context-field">
                        <span>Custom provider endpoint</span>
                        <input
                          placeholder="https://your-provider.example.com/v1"
                          value={customProviderEndpoint}
                          onChange={(event) => setCustomProviderEndpoint(event.target.value)}
                        />
                      </label>
                      <label className="context-field">
                        <span>Custom provider API key</span>
                        <input
                          type="password"
                          value={customProviderApiKey}
                          onChange={(event) => setCustomProviderApiKey(event.target.value)}
                        />
                      </label>
                      <p className="muted">API key kept in memory for this session only.</p>
                    </>
                  ) : null}
                  <label className="context-field">
                    <span>Default dashboard name</span>
                    <input value={dashboardName} onChange={(event) => setDashboardName(event.target.value)} />
                  </label>
                  <label className="context-field">
                    <span>Default export format</span>
                    <input value={selectedFormat} onChange={(event) => setSelectedFormat(event.target.value)} />
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={privacySettings.hideRawData}
                      onChange={(event) => updatePrivacySetting("hideRawData", event.target.checked)}
                    />
                    <span>Hide raw data in shared views</span>
                  </label>
                  <label className="toggle-row">
                    <input
                      aria-label="Mask sensitive fields"
                      type="checkbox"
                      checked={privacySettings.maskSensitiveFields}
                      onChange={(event) => updatePrivacySetting("maskSensitiveFields", event.target.checked)}
                    />
                    <span>Mask sensitive fields</span>
                  </label>
                  <label className="toggle-row">
                    <input
                      aria-label="Include AI prompts in evidence export"
                      type="checkbox"
                      checked={privacySettings.includeAiPrompts}
                      onChange={(event) => updatePrivacySetting("includeAiPrompts", event.target.checked)}
                    />
                    <span>Include AI prompts in evidence export</span>
                  </label>
                  <label className="toggle-row">
                    <input
                      aria-label="Include evidence package in exports"
                      type="checkbox"
                      checked={privacySettings.includeEvidencePackage}
                      onChange={(event) => updatePrivacySetting("includeEvidencePackage", event.target.checked)}
                    />
                    <span>Include evidence package in exports</span>
                  </label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={passwordEnabled} onChange={(event) => setPasswordEnabled(event.target.checked)} />
                    <span>Password protect share links</span>
                  </label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={expiryEnabled} onChange={(event) => setExpiryEnabled(event.target.checked)} />
                    <span>Expire share links automatically</span>
                  </label>
                  {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
                </div>
              </ScreenCard>
            )}

            <div className="flow-footer">
              <button className="ghost-button" type="button" onClick={() => moveStep(-1)} disabled={step === "upload"}>
                <ArrowLeft size={16} />
                Back
              </button>
              <button className="primary-button" type="button" onClick={() => moveStep(1)} disabled={step === "settings"}>
                Next
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          <aside className="right-rail">
            <div className="rail-card">
              <h3>Workspace snapshot</h3>
              <p>Domain detected</p>
              <div className="rail-stat">
                <span>Readiness</span>
                <strong>{profile.readinessScore}%</strong>
              </div>
              <div className="rail-stat">
                <span>Rows</span>
                <strong>{profile.rowCount.toLocaleString()}</strong>
              </div>
            </div>

            <div className="rail-card">
              <h3>Evidence surface</h3>
              <p>{dashboard.evidence[1]?.value ?? "AI analysis preview"}</p>
              <button className="ghost-button full" type="button" onClick={() => goToStep("evidence")}>
                Open evidence
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function titleForStep(step: AppStep) {
  switch (step) {
    case "upload":
      return "Upload business data";
    case "profile":
      return "AI Data Understanding";
    case "integrations":
      return "Integrations";
    case "recommendations":
      return "Recommended dashboards";
    case "workspace":
      return "Executive Sales Performance Dashboard";
    case "analysis":
      return "AI analysis preview";
    case "evidence":
      return "Evidence";
    case "export":
      return "Export and share dashboard";
    case "settings":
      return "Settings";
  }
}

function defaultConnectorSettings(): ConnectorSettings {
  return {
    selectedConnectorId: "google-sheets",
    sourceName: "Google Sheets demo source",
    sourceText: "Order Date,Region,Product,Sales Amount,Gross Profit,Orders,Customer\n2026-04-01,East,Category C,220000,72000,510,Connected Account A\n2026-05-01,West,Category A,180000,54000,470,Connected Account B",
    lastRefreshAt: "",
    rowCount: 0
  };
}

function connectorLabel(connectorId: ConnectorId, connectors: ReturnType<typeof listDataConnectors>): string {
  return connectors.find((connector) => connector.id === connectorId)?.label ?? connectorId;
}

function ScreenCard({ title, icon, tone, children }: { title: string; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <div className={`screen-card ${tone}`}>
      <div className="screen-header">
        <div className="screen-title">
          <span className="screen-icon">{icon}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="screen-body">{children}</div>
    </div>
  );
}

function ChecklistItem({ children }: { children: ReactNode }) {
  return (
    <div className="check-item">
      <CheckCircle2 size={16} />
      <span>{children}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ChartWithInsight({
  children,
  compact = false,
  evidenceId,
  onOpenEvidence,
  insight
}: {
  children: ReactNode;
  compact?: boolean;
  evidenceId: DashboardInsightKey;
  insight: DashboardInsight;
  onOpenEvidence: (evidenceId: DashboardInsightKey) => void;
}) {
  return (
    <div className={`chart-with-insight ${compact ? "compact" : ""}`}>
      <div className="chart-region">{children}</div>
      <InsightNote insight={insight} onOpenEvidence={() => onOpenEvidence(evidenceId)} />
    </div>
  );
}

function InsightNote({ insight, onOpenEvidence }: { insight: DashboardInsight; onOpenEvidence: () => void }) {
  return (
    <aside className={`insight-note confidence-${insight.confidence}`}>
      <div className="insight-note-head">
        <h4>{insight.title}</h4>
        <span>{insight.confidence}</span>
      </div>
      <strong>{insight.takeaway}</strong>
      <p>{insight.detail}</p>
      <small>{insight.evidenceLabels.join(" + ")}</small>
      <button className="ghost-button full" type="button" onClick={onOpenEvidence} aria-label={`Open evidence for ${insight.title}`}>
        View evidence
      </button>
    </aside>
  );
}

function EvidenceDrawer({
  formulas,
  onClose,
  subject
}: {
  formulas: EvidencePackageLike["formulas"];
  onClose: () => void;
  subject: EvidenceSubject;
}) {
  const subjectFormulas = formulas.filter((formula) => subject.formulaLabels.includes(formula.label));
  return (
    <aside className="evidence-drawer" aria-label="Evidence drawer">
      <div className="evidence-drawer-head">
        <div>
          <p className="muted">Evidence drawer</p>
          <h3>{subject.title}</h3>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>
          Close evidence drawer
        </button>
      </div>
      <p>{subject.summary}</p>
      <div className="evidence-meta-grid">
        <span>Confidence: {subject.confidence}</span>
        <span>Fields: {subject.sourceFields.join(" + ") || "Not detected"}</span>
      </div>
      <div>
        <h4>Formula display</h4>
        {subjectFormulas.length ? subjectFormulas.map((formula) => (
          <p className="formula-line" key={formula.id}>
            <strong>{formula.label}</strong>
            <span>{formula.expression}</span>
          </p>
        )) : <p className="muted">No formula required for this insight.</p>}
      </div>
      <div>
        <h4>Assumption log</h4>
        <ul>
          {subject.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4>Source row preview</h4>
        <SourceRows rows={subject.rowPreview} />
      </div>
    </aside>
  );
}

type EvidencePackageLike = ReturnType<typeof createEvidencePackage>;

function SourceRows({ rows }: { rows: EvidencePackageLike["rowPreview"] }) {
  return (
    <div className="source-row-preview">
      {rows.map((row) => (
        <div className="source-row" key={row.rowIndex}>
          <strong>Row {row.rowIndex}</strong>
          <dl>
            {Object.entries(row.values).slice(0, 5).map(([field, value]) => (
              <Fragment key={field}>
                <dt>{field}</dt>
                <dd>{String(value ?? "n/a")}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function AuditTrail({ events }: { events: AiAuditEvent[] }) {
  if (!events.length) {
    return <p className="muted">No AI actions recorded yet.</p>;
  }

  return (
    <div className="audit-trail">
      {events.map((event) => (
        <div className="audit-event" key={event.id}>
          <div>
            <strong>{event.actionTitle}</strong>
            <span>{event.status}</span>
          </div>
          <p>{event.question}</p>
          <small>{event.providerLabel}</small>
          <small>{event.model}</small>
          <small>{event.evidenceFields.join(" + ") || "No fields bound"}</small>
        </div>
      ))}
    </div>
  );
}

function BarList({ points, suffix = "" }: { points: Array<{ label: string; value: number }>; suffix?: string }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="bar-list" role="img" aria-label="Bar chart">
      {points.slice(0, 6).map((point) => (
        <div className="bar-row" key={point.label}>
          <span>{point.label}</span>
          <div className="bar-track">
            <span style={{ width: `${Math.max(8, (point.value / max) * 100)}%` }} />
          </div>
          <strong>{suffix ? `${point.value.toLocaleString()}${suffix}` : Math.round(point.value).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function GrowthPanel({ points, summary }: { points: Array<{ label: string; value: number }>; summary?: { changePercent: number; direction: string; currentPeriod: string; previousPeriod: string } }) {
  return (
    <div className="growth-panel">
      <LineChart points={points} />
      {summary ? (
        <div className={`growth-callout ${summary.direction}`}>
          <strong>{summary.changePercent}%</strong>
          <span>{summary.currentPeriod} vs {summary.previousPeriod}</span>
        </div>
      ) : null}
    </div>
  );
}

function LineChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const plotted = normalizeSvgPoints(points);
  const polyline = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <div className="svg-chart" role="img" aria-label="Line chart">
      <svg viewBox="0 0 320 132" preserveAspectRatio="xMidYMid meet">
        <polyline className="line-chart-path" points={polyline} />
        {plotted.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="4" />
        ))}
      </svg>
      <div className="axis-labels">
        {points.slice(0, 4).map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
    </div>
  );
}

function AreaChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const plotted = normalizeSvgPoints(points);
  const top = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const area = plotted.length ? `0,124 ${top} 320,124` : "";
  return (
    <div className="svg-chart" role="img" aria-label="Area chart">
      <svg viewBox="0 0 320 132" preserveAspectRatio="xMidYMid meet">
        <polygon className="area-chart-fill" points={area} />
        <polyline className="line-chart-path" points={top} />
      </svg>
      <BarList points={points} />
    </div>
  );
}

function GroupedBars({ points }: { points: Array<{ label: string; primary: number; secondary: number }> }) {
  const max = Math.max(...points.flatMap((point) => [point.primary, point.secondary]), 1);
  return (
    <div className="grouped-bars" role="img" aria-label="Stacked column chart">
      {points.slice(0, 6).map((point) => (
        <div className="group-row" key={point.label}>
          <span>{point.label}</span>
          <div className="group-tracks">
            <div className="bar-track revenue"><span style={{ width: `${Math.max(8, (point.primary / max) * 100)}%` }} /></div>
            <div className="bar-track profit"><span style={{ width: `${Math.max(8, (point.secondary / max) * 100)}%` }} /></div>
          </div>
          <strong>{Math.round(point.primary).toLocaleString()} / {Math.round(point.secondary).toLocaleString()}</strong>
        </div>
      ))}
      <div className="legend-row">
        <span><i className="legend revenue" />Revenue</span>
        <span><i className="legend profit" />Profit</span>
      </div>
    </div>
  );
}

function DoughnutChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const palette = ["#015b64", "#1ca7a0", "#f17c5a", "#f1ba89", "#8bc9c1", "#0d2f33"];
  const total = points.reduce((sum, point) => sum + point.value, 0) || 1;
  let cursor = 0;
  const stops = points.slice(0, 6).map((point, index) => {
    const start = cursor;
    cursor += (point.value / total) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  return (
    <div className="doughnut-wrap" role="img" aria-label="Doughnut chart">
      <div className="doughnut" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
        <span>{Math.round(total).toLocaleString()}</span>
      </div>
      <div className="legend-stack">
        {points.slice(0, 4).map((point, index) => (
          <span key={point.label}>
            <i style={{ background: palette[index % palette.length] }} />
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function GaugeChart({ value, label }: { value: number; label: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="gauge-wrap" role="img" aria-label="Gauge chart">
      <div className="gauge" style={{ "--gauge-value": `${bounded}%` } as CSSProperties}>
        <span>{bounded ? `${bounded.toFixed(1)}%` : "n/a"}</span>
      </div>
      <p>{label}</p>
      <div className="bullet-graph" role="img" aria-label="Bullet graph">
        <span style={{ width: `${Math.max(8, bounded)}%` }} />
        <i style={{ left: "30%" }} />
      </div>
    </div>
  );
}

function HistogramChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const values = points.map((point) => point.value).filter((value) => value > 0);
  const max = Math.max(...values, 1);
  return (
    <div className="histogram" role="img" aria-label="Histogram chart">
      {values.slice(0, 8).map((value, index) => (
        <span key={`${value}-${index}`} style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function ScatterPlot({ points }: { points: Array<{ label: string; primary: number; secondary: number }> }) {
  const maxX = Math.max(...points.map((point) => point.primary), 1);
  const maxY = Math.max(...points.map((point) => point.secondary), 1);
  return (
    <div className="svg-chart" role="img" aria-label="Scatter plot">
      <svg viewBox="0 0 320 132" preserveAspectRatio="xMidYMid meet">
        {points.map((point) => (
          <circle
            key={point.label}
            className="scatter-dot"
            cx={24 + (point.primary / maxX) * 272}
            cy={116 - (point.secondary / maxY) * 100}
            r={6}
          />
        ))}
      </svg>
      <div className="axis-labels">
        <span>Revenue</span>
        <span>Profit</span>
      </div>
    </div>
  );
}

function ShareList({ points }: { points: Array<{ label: string; value: number }> }) {
  const total = points.reduce((sum, point) => sum + point.value, 0) || 1;
  return (
    <div className="share-list">
      {points.slice(0, 6).map((point) => {
        const share = Math.round((point.value / total) * 100);
        return (
          <div className="share-row" key={point.label}>
            <span>{point.label}</span>
            <strong>{share}%</strong>
            <div className="bar-track"><span style={{ width: `${Math.max(8, share)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function DriverMatrix({ rows }: { rows: Array<{ label: string; revenue: number; profit: number; orders: number; margin: number }> }) {
  return (
    <div className="matrix-table" role="table" aria-label="Top driver matrix">
      <div className="matrix-row header" role="row">
        <span>Segment</span>
        <span>Revenue</span>
        <span>Profit</span>
        <span>Orders</span>
        <span>Margin</span>
      </div>
      {rows.map((row) => (
        <div className="matrix-row" role="row" key={row.label}>
          <span>{row.label}</span>
          <span>{Math.round(row.revenue).toLocaleString()}</span>
          <span>{Math.round(row.profit).toLocaleString()}</span>
          <span>{Math.round(row.orders).toLocaleString()}</span>
          <span>{row.margin}%</span>
        </div>
      ))}
    </div>
  );
}

function PointTable({ points, suffix = "" }: { points: Array<{ label: string; value: number }>; suffix?: string }) {
  return (
    <div className="point-table" role="table" aria-label="Data table chart">
      <div className="point-table-row header" role="row">
        <span>Label</span>
        <span>Value</span>
      </div>
      {points.slice(0, 8).map((point) => (
        <div className="point-table-row" role="row" key={point.label}>
          <span>{point.label}</span>
          <strong>{suffix ? `${point.value.toLocaleString()}${suffix}` : Math.round(point.value).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function DashboardBuilderPanel({
  chartType,
  filterField,
  filterOptions,
  filterValue,
  isAutofit,
  rowsInView,
  selectedChartType,
  selectedWidgetId,
  selectedWidgetSize,
  suitability,
  widgetOrder,
  whyText,
  onApplyChartType,
  onChartTypeChange,
  onFilterChange,
  onSelectWidget,
  onSizeChange,
  onToggleAutofit
}: {
  chartType: DashboardBuilderChartType;
  filterField?: string;
  filterOptions: string[];
  filterValue: string;
  isAutofit: boolean;
  rowsInView: number;
  selectedChartType: DashboardBuilderChartType;
  selectedWidgetId: DashboardWidgetId;
  selectedWidgetSize: DashboardBuilderSize;
  suitability: ReturnType<typeof scoreChartSuitability>;
  widgetOrder: DashboardWidgetId[];
  whyText: string;
  onApplyChartType: () => void;
  onChartTypeChange: (chartType: DashboardBuilderChartType) => void;
  onFilterChange: (value: string) => void;
  onSelectWidget: (widgetId: DashboardWidgetId) => void;
  onSizeChange: (size: DashboardBuilderSize) => void;
  onToggleAutofit: () => void;
}) {
  return (
    <aside className="builder-panel" aria-label="Dashboard Builder">
      <div className="builder-panel-head">
        <h3>Dashboard Builder</h3>
        <span className="chip">{isAutofit ? "Autofit on" : "Manual grid"}</span>
      </div>
      <label className="context-field">
        <span>{filterField ? `Filter by ${filterField}` : "Filter by dimension"}</span>
        <select value={filterValue} onChange={(event) => onFilterChange(event.target.value)} disabled={!filterField}>
          <option value="All">All</option>
          {filterOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <div className="builder-stat">
        <span>Rows in view</span>
        <strong>{rowsInView.toLocaleString()}</strong>
      </div>
      <label className="context-field">
        <span>Selected chart</span>
        <select value={selectedWidgetId} onChange={(event) => onSelectWidget(event.target.value as DashboardWidgetId)}>
          {widgetOrder.map((widgetId) => (
            <option key={widgetId} value={widgetId}>{getWidgetTitle(widgetId)}</option>
          ))}
        </select>
      </label>
      <label className="context-field">
        <span>Chart type</span>
        <select value={chartType} onChange={(event) => onChartTypeChange(event.target.value as DashboardBuilderChartType)}>
          {builderChartTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>
      <div className={`suitability-box ${suitability.status}`}>
        <div>
          <strong>{suitability.status === "recommended" ? "Recommended" : suitability.status === "warning" ? "Warning" : "Blocked"}</strong>
          <span>{suitability.score}/100</span>
        </div>
        <p>{suitability.reason}</p>
      </div>
      <button className="primary-button full" type="button" onClick={onApplyChartType} disabled={suitability.status === "blocked" || chartType === selectedChartType}>
        Apply chart type
      </button>
      <label className="context-field">
        <span>Chart size</span>
        <select value={selectedWidgetSize} onChange={(event) => onSizeChange(event.target.value as DashboardBuilderSize)}>
          {builderSizes.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <div className="why-chart-box">
        <h4>Why this chart?</h4>
        <p>{whyText}</p>
      </div>
      <button className="ghost-button full" type="button" onClick={onToggleAutofit}>
        Smart autofit
      </button>
    </aside>
  );
}

function AIChatPanel({
  draft,
  messages,
  pendingAction,
  onApplyAction,
  onAsk,
  onDismissAction,
  onDraftChange
}: {
  draft: string;
  messages: ChatMessage[];
  pendingAction: ConsultantAction | null;
  onApplyAction: (action: ConsultantAction) => void;
  onAsk: (question: string) => void | Promise<void>;
  onDismissAction: () => void;
  onDraftChange: (draft: string) => void;
}) {
  return (
    <aside className="chat-panel" aria-label="AI Consultant chat">
      <div className="chat-head">
        <h3>AI Consultant Chat</h3>
        <span className="chip">Live on data</span>
      </div>
      <div className="suggestion-row" aria-label="Suggested questions">
        {chatSuggestions.map((suggestion) => (
          <button className="ghost-button full" type="button" key={suggestion} onClick={() => void onAsk(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
      <div className="chat-log" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.content}
            {message.providerMeta ? <span className="provider-meta">{message.providerMeta}</span> : null}
          </div>
        ))}
      </div>
      {pendingAction ? (
        <div className={`consultant-action-card ${pendingAction.status}`}>
          <div>
            <p className="muted">Proposed action</p>
            <h4>{pendingAction.title}</h4>
            <p>{pendingAction.description}</p>
          </div>
          <div className="validation-list">
            {pendingAction.checks.map((check) => (
              <span key={check.name} className={check.passed ? "passed" : "failed"}>
                {check.name}
              </span>
            ))}
          </div>
          {pendingAction.evidence.length ? (
            <small>{pendingAction.evidence.map((item) => item.fieldName).join(" + ")}</small>
          ) : null}
          <div className="action-row">
            <button className="primary-button" type="button" onClick={() => onApplyAction(pendingAction)} disabled={pendingAction.status !== "passed"}>
              Apply action
            </button>
            <button className="ghost-button" type="button" onClick={onDismissAction}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onAsk(draft);
        }}
      >
        <label className="context-field">
          <span>Ask AI Consultant</span>
          <input value={draft} onChange={(event) => onDraftChange(event.target.value)} />
        </label>
        <button className="primary-button full" type="submit">
          Send question
        </button>
      </form>
    </aside>
  );
}

function formatConsultantAnswer(answer: string, confidence: "high" | "medium" | "low", caveats: string[]): string {
  const caveatText = caveats.slice(0, 2).join(" ");
  return `${answer} Confidence: ${confidence}. ${caveatText}`;
}

function getWidgetTitle(widgetId: DashboardWidgetId): string {
  const titles: Record<DashboardWidgetId, string> = {
    kpis: "Performance snapshot",
    growth: "Revenue Growth",
    trend: "Revenue trend",
    drivers: "Regional Performance",
    revenueProfit: "Revenue vs Profit",
    productMix: "Product Mix",
    margin: "Margin by Region",
    matrix: "Top Driver Matrix",
    profitabilityGauge: "Profitability Gauge",
    revenueDistribution: "Revenue Distribution",
    revenueProfitScatter: "Revenue Profit Scatter",
    aiProductDoughnut: "AI Product Doughnut",
    risks: "Risks",
    opportunities: "Opportunities",
    regionalComparison: "Regional Sales Comparison",
    consultant: "AI Consultant"
  };
  return titles[widgetId];
}

function inferWidgetSize(widgetId: DashboardWidgetId): DashboardBuilderSize {
  if (widgetId === "kpis") return "full";
  if (["drivers", "regionalComparison"].includes(widgetId)) return "half";
  if (["risks", "opportunities", "margin", "profitabilityGauge", "revenueDistribution", "aiProductDoughnut", "consultant"].includes(widgetId)) return "third";
  return "wide";
}

function getWidgetWhy(widgetId: DashboardWidgetId, dashboard: ReturnType<typeof buildDashboard>): string {
  if (widgetId === "drivers" || widgetId === "regionalComparison") return dashboard.insights.regional.detail;
  if (widgetId === "growth" || widgetId === "trend") return dashboard.insights.growth.detail;
  if (widgetId === "revenueProfit") return dashboard.insights.revenueProfit.detail;
  if (widgetId === "productMix" || widgetId === "aiProductDoughnut") return dashboard.insights.productMix.detail;
  if (widgetId === "margin" || widgetId === "profitabilityGauge") return dashboard.insights.margin.detail;
  if (widgetId === "matrix") return dashboard.insights.matrix.detail;
  if (widgetId === "revenueDistribution") return dashboard.insights.distribution.detail;
  if (widgetId === "revenueProfitScatter") return dashboard.insights.scatter.detail;
  if (widgetId === "kpis") return "KPIs summarize revenue, margin, order volume, and quality because executives need a fast performance read.";
  return "This card adds narrative context and next actions around the current dashboard.";
}

function defaultChartTypeForWidget(widgetId: DashboardWidgetId): DashboardBuilderChartType {
  if (widgetId === "growth") return "line";
  if (widgetId === "trend") return "area";
  if (widgetId === "productMix" || widgetId === "aiProductDoughnut") return "doughnut";
  if (widgetId === "revenueProfitScatter") return "scatter";
  if (widgetId === "profitabilityGauge") return "gauge";
  if (widgetId === "matrix") return "table";
  return "bar";
}

function chartTypeToKind(chartType: DashboardBuilderChartType): ChartKind {
  if (chartType === "auto") return "bar";
  if (chartType === "table") return "bar";
  return chartType;
}

function normalizeSvgPoints(points: Array<{ label: string; value: number }>) {
  const visible = points.length ? points : [{ label: "No data", value: 0 }];
  const max = Math.max(...visible.map((point) => point.value), 1);
  const min = Math.min(...visible.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);
  return visible.map((point, index) => ({
    label: point.label,
    x: visible.length === 1 ? 160 : 16 + (index / (visible.length - 1)) * 288,
    y: 116 - ((point.value - min) / range) * 96
  }));
}

function normalizeWidgetOrder(widgetOrder: string[]): DashboardWidgetId[] {
  const validWidgets = widgetOrder.filter((widget): widget is DashboardWidgetId =>
    dashboardWidgetIds.has(widget as DashboardWidgetId)
  );
  return validWidgets.length ? validWidgets : defaultWidgetOrder;
}

function normalizeWidgetId(widgetId?: string): DashboardWidgetId {
  return dashboardWidgetIds.has(widgetId as DashboardWidgetId) ? widgetId as DashboardWidgetId : "drivers";
}

function normalizeWidgetBuilderSettings(settings?: Record<string, { chartType?: string; size?: string }>): WidgetBuilderSettings {
  if (!settings) return {};
  const normalized: WidgetBuilderSettings = {};
  for (const [widgetId, value] of Object.entries(settings)) {
    if (!dashboardWidgetIds.has(widgetId as DashboardWidgetId)) continue;
    normalized[widgetId as DashboardWidgetId] = {
      chartType: builderChartTypes.includes(value.chartType as DashboardBuilderChartType)
        ? value.chartType as DashboardBuilderChartType
        : undefined,
      size: builderSizes.includes(value.size as DashboardBuilderSize)
        ? value.size as DashboardBuilderSize
        : undefined
    };
  }
  return normalized;
}

function parsePercent(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function DashboardWidget({
  id,
  title,
  className,
  confidence = "medium",
  children,
  isSelected = false,
  onMove,
  onSelect,
  onDragStart,
  onDrop
}: {
  id: DashboardWidgetId;
  title: string;
  className: string;
  confidence?: string;
  children: ReactNode;
  isSelected?: boolean;
  onMove: (id: DashboardWidgetId, direction: -1 | 1) => void;
  onSelect?: (id: DashboardWidgetId) => void;
  onDragStart: (id: DashboardWidgetId) => void;
  onDrop: (id: DashboardWidgetId) => void;
}) {
  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
  }

  return (
    <article
      className={`dashboard-widget ${className} ${isSelected ? "selected" : ""}`}
      data-testid={`widget-${id}`}
      draggable
      onDragStart={() => onDragStart(id)}
      onDragOver={handleDragOver}
      onDrop={() => onDrop(id)}
    >
      <div className="widget-head">
        <div className="widget-title-row">
          <GripVertical size={16} aria-hidden="true" />
          <h3 data-testid="dashboard-widget-title">{title}</h3>
          <span className="confidence-pill">Confidence: {confidence}</span>
        </div>
        <div className="widget-actions">
          <button className="icon-button text-icon-button" type="button" aria-label={`Edit ${title}`} onClick={() => onSelect?.(id)}>
            Edit
          </button>
          <button className="icon-button" type="button" aria-label={`Move ${title} up`} onClick={() => onMove(id, -1)}>
            <ArrowUp size={15} />
          </button>
          <button className="icon-button" type="button" aria-label={`Move ${title} down`} onClick={() => onMove(id, 1)}>
            <ArrowDown size={15} />
          </button>
        </div>
      </div>
      <div className="widget-body">{children}</div>
    </article>
  );
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  if (navigator.userAgent.includes("jsdom")) {
    URL.revokeObjectURL(url);
    return;
  }
  link.click();
  URL.revokeObjectURL(url);
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export default App;
