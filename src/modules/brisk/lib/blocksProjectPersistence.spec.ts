import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadProjectSnapshot,
  saveProjectSnapshot,
  sanitizeProjectSnapshot,
  type ProjectSnapshot,
} from './projectPersistence';

const snapshot: ProjectSnapshot = {
  id: 'default',
  dashboardName: 'Executive Sales Performance Dashboard',
  fileName: 'sales.csv',
  rows: [{ Region: 'North', Revenue: 100 }],
  widgetOrder: ['kpis', 'growth'],
  dashboardTabs: [{ id: 'overview', label: 'Executive Overview' }],
  activeDashboardTab: 'overview',
  selectedFormat: 'Excel',
  semanticOverrides: [{ fieldName: 'Customer', role: 'dimension' }],
  builderSettings: {
    selectedWidgetId: 'drivers',
    selectedFilterValue: 'North',
    widgetSettings: {
      drivers: { chartType: 'area', size: 'full' },
    },
  },
  providerSettings: {
    selectedProviderId: 'custom-compatible',
    customProviderEndpoint: 'https://llm.example.com/v1',
    customProviderApiKey: 'secret-key',
  },
  chatMessages: [{ id: 'welcome', role: 'assistant', content: 'Hello' }],
  auditTrail: [
    {
      id: 'audit-1',
      timestamp: '2026-07-02T00:00:00.000Z',
      question: 'Why did revenue drop?',
      providerLabel: 'OpenAI',
      model: 'gpt-4.1-mini',
      actionTitle: 'Explain Insight',
      status: 'answered',
      evidenceFields: ['Revenue'],
    },
  ],
  privacySettings: {
    hideRawData: true,
    maskSensitiveFields: true,
    includeAiPrompts: false,
    includeEvidencePackage: true,
  },
  connectorSettings: {
    selectedConnectorId: 'google-sheets',
    sourceName: 'Q3 Sheet',
    sourceText: 'Order Date,Region,Sales Amount\n2026-04-01,East,220000',
    lastRefreshAt: '2026-07-02T00:00:00.000Z',
    rowCount: 1,
  },
  updatedAt: '2026-07-02T00:00:00.000Z',
};

describe('Blocks project persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('sanitizes provider API keys before saving snapshots', () => {
    const sanitized = sanitizeProjectSnapshot(snapshot);

    expect(sanitized.providerSettings.customProviderEndpoint).toBe('https://llm.example.com/v1');
    expect(sanitized.providerSettings.customProviderApiKey).toBeUndefined();
    expect(JSON.stringify(sanitized)).not.toContain('secret-key');
  });

  it('saves project snapshots through BriskDashboard GraphQL records', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            insertBriskDashboard: {
              acknowledged: true,
              itemId: 'dashboard-1',
              totalImpactedData: 1,
            },
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveProjectSnapshot(snapshot, {
      accessToken: 'user-token',
      apiBaseUrl: 'https://api.seliseblocks.com',
      projectSlug: 'dfqocj',
      xBlocksKey: 'blocks-key',
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const snapshotJson = body.variables.input.evidenceJson;

    expect(result.mode).toBe('blocks');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.seliseblocks.com/uds/v1/dfqocj/gateway');
    expect(body.query).toContain('insertBriskDashboard');
    expect(snapshotJson).toContain('Executive Sales Performance Dashboard');
    expect(snapshotJson).not.toContain('secret-key');
  });

  it('loads the newest project snapshot from BriskDashboard records', async () => {
    const storedSnapshot = sanitizeProjectSnapshot({
      ...snapshot,
      dashboardName: 'Loaded Dashboard',
      updatedAt: '2026-07-02T01:00:00.000Z',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              getBriskDashboards: {
                totalCount: 1,
                items: [
                  {
                    ItemId: 'dashboard-1',
                    name: 'Loaded Dashboard',
                    evidenceJson: JSON.stringify(storedSnapshot),
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      )
    );

    const loaded = await loadProjectSnapshot('default', {
      accessToken: 'user-token',
      apiBaseUrl: 'https://api.seliseblocks.com',
      projectSlug: 'dfqocj',
      xBlocksKey: 'blocks-key',
    });

    expect(loaded?.dashboardName).toBe('Loaded Dashboard');
    expect(loaded?.providerSettings.customProviderApiKey).toBeUndefined();
  });

  it('falls back to localStorage when no Blocks token is available', async () => {
    const result = await saveProjectSnapshot(snapshot);
    const stored = JSON.parse(localStorage.getItem('brisk.project.default') ?? '{}');

    expect(result.mode).toBe('local');
    expect(stored.dashboardName).toBe('Executive Sales Performance Dashboard');
    expect(JSON.stringify(stored)).not.toContain('secret-key');
  });
});
