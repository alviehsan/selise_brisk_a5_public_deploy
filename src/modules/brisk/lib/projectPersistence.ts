import { useAuthStore } from '@/state/store/auth';
import type { AiProviderId } from './aiProviders';
import type { ConnectorSettings } from './dataConnectors';
import type {
  AiAuditEvent,
  DatasetRow,
  PrivacySettings,
  SemanticFieldOverride,
} from './briskTypes';

export const DEFAULT_PROJECT_ID = 'default';
export const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://api.seliseblocks.com';
export const DEFAULT_PROJECT_SLUG = import.meta.env.VITE_PROJECT_SLUG ?? 'dfqocj';
export const DEFAULT_X_BLOCKS_KEY = import.meta.env.VITE_X_BLOCKS_KEY ?? '';

export interface PersistedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  providerMeta?: string;
}

export interface ProjectSnapshot {
  id: string;
  dashboardName: string;
  fileName: string;
  rows: DatasetRow[];
  widgetOrder: string[];
  dashboardTabs: Array<{ id: string; label: string }>;
  activeDashboardTab: string;
  selectedFormat: string;
  semanticOverrides?: SemanticFieldOverride[];
  builderSettings?: {
    selectedWidgetId?: string;
    selectedFilterValue?: string;
    widgetSettings?: Record<string, { chartType?: string; size?: string }>;
  };
  providerSettings: {
    selectedProviderId: AiProviderId;
    customProviderEndpoint: string;
    customProviderApiKey?: string;
  };
  chatMessages: PersistedChatMessage[];
  auditTrail?: AiAuditEvent[];
  privacySettings?: PrivacySettings;
  connectorSettings?: ConnectorSettings;
  updatedAt: string;
}

export interface PersistenceOptions {
  apiBaseUrl?: string;
  accessToken?: string | null;
  projectSlug?: string;
  xBlocksKey?: string;
}

export interface SaveResult {
  mode: 'blocks' | 'local';
  updatedAt: string;
}

export interface ProviderSecretRequest {
  projectId: string;
  providerId: AiProviderId;
  endpoint: string;
  apiKey: string;
}

export interface ProviderSecretResult {
  providerId: AiProviderId;
  status: 'stored' | 'unavailable';
  secretRef?: string;
  keyPersisted: boolean;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface BriskDashboardRecord {
  ItemId?: string;
  name?: string;
  evidenceJson?: string;
  updatedAt?: string;
}

interface BriskDashboardListResponse {
  getBriskDashboards: {
    items: BriskDashboardRecord[];
    totalCount: number;
  };
}

interface BriskDashboardSaveResponse {
  insertBriskDashboard?: {
    acknowledged: boolean;
    itemId?: string;
  };
}

const storageKey = (projectId: string) => `brisk.project.${projectId}`;

export function sanitizeProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  const providerSettings = { ...snapshot.providerSettings };
  delete providerSettings.customProviderApiKey;

  return {
    ...snapshot,
    providerSettings,
  };
}

export async function saveProjectSnapshot(
  snapshot: ProjectSnapshot,
  options: PersistenceOptions = {}
): Promise<SaveResult> {
  const sanitized = sanitizeProjectSnapshot({
    ...snapshot,
    updatedAt: new Date().toISOString(),
  });

  const config = getBlocksConfig(options);
  if (!config) return saveLocalSnapshot(snapshot.id, sanitized);

  try {
    await postGateway<BriskDashboardSaveResponse>(
      `mutation($input: BriskDashboardInsertInput!) {
        insertBriskDashboard(input: $input) {
          acknowledged
          itemId
          totalImpactedData
          message
        }
      }`,
      {
        input: {
          workspaceId: snapshot.id,
          datasetId: snapshot.fileName,
          name: sanitized.dashboardName,
          description: `SELISE Brisk a5 project ${snapshot.id}`,
          status: 'draft',
          layoutJson: JSON.stringify({
            widgetOrder: sanitized.widgetOrder,
            dashboardTabs: sanitized.dashboardTabs,
            activeDashboardTab: sanitized.activeDashboardTab,
            builderSettings: sanitized.builderSettings,
          }),
          widgetsJson: JSON.stringify({
            selectedFormat: sanitized.selectedFormat,
            chatMessages: sanitized.chatMessages,
            connectorSettings: sanitized.connectorSettings,
          }),
          evidenceJson: JSON.stringify(sanitized),
          createdByUserId: 'blocks-user',
          updatedByUserId: 'blocks-user',
          createdAt: sanitized.updatedAt,
          updatedAt: sanitized.updatedAt,
        },
      },
      config
    );

    return {
      mode: 'blocks',
      updatedAt: sanitized.updatedAt,
    };
  } catch {
    return saveLocalSnapshot(snapshot.id, sanitized);
  }
}

export async function loadProjectSnapshot(
  projectId: string,
  options: PersistenceOptions = {}
): Promise<ProjectSnapshot | null> {
  const config = getBlocksConfig(options);
  if (!config) return loadLocalProjectSnapshot(projectId);

  try {
    const data = await postGateway<BriskDashboardListResponse>(
      `query($workspaceId: String!) {
        getBriskDashboards(
          where: { workspaceId: { eq: $workspaceId } }
          order: [{ field: "updatedAt", direction: DESC }]
          paging: { pageNo: 1, pageSize: 1 }
        ) {
          totalCount
          items {
            ItemId
            name
            evidenceJson
            updatedAt
          }
        }
      }`,
      { workspaceId: projectId },
      config
    );

    const record = data.getBriskDashboards.items[0];
    if (!record?.evidenceJson) return loadLocalProjectSnapshot(projectId);

    return sanitizeProjectSnapshot(JSON.parse(record.evidenceJson) as ProjectSnapshot);
  } catch {
    return loadLocalProjectSnapshot(projectId);
  }
}

export async function storeProviderSecret(
  request: ProviderSecretRequest
): Promise<ProviderSecretResult> {
  return {
    providerId: request.providerId,
    status: 'unavailable',
    keyPersisted: false,
  };
}

function saveLocalSnapshot(projectId: string, sanitized: ProjectSnapshot): SaveResult {
  localStorage.setItem(storageKey(projectId), JSON.stringify(sanitized));
  return {
    mode: 'local',
    updatedAt: sanitized.updatedAt,
  };
}

function loadLocalProjectSnapshot(projectId: string): ProjectSnapshot | null {
  const stored = localStorage.getItem(storageKey(projectId));
  if (!stored) return null;

  try {
    return sanitizeProjectSnapshot(JSON.parse(stored) as ProjectSnapshot);
  } catch {
    return null;
  }
}

function getBlocksConfig(options: PersistenceOptions) {
  const accessToken = options.accessToken ?? useAuthStore.getState().accessToken;
  const xBlocksKey = options.xBlocksKey ?? DEFAULT_X_BLOCKS_KEY;
  const projectSlug = options.projectSlug ?? DEFAULT_PROJECT_SLUG;
  const apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');

  if (!accessToken || !xBlocksKey || !projectSlug || !apiBaseUrl) return null;

  return {
    accessToken,
    apiBaseUrl,
    projectSlug,
    xBlocksKey,
  };
}

async function postGateway<T>(
  query: string,
  variables: Record<string, unknown>,
  config: NonNullable<ReturnType<typeof getBlocksConfig>>
): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}/uds/v1/${config.projectSlug}/gateway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-blocks-key': config.xBlocksKey,
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message ?? `Gateway request failed: ${response.status}`);
  }

  return (payload.data ?? ({} as T)) as T;
}
