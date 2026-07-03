export type AiProviderId =
  | "openai"
  | "azure-openai"
  | "anthropic"
  | "google-gemini"
  | "mistral"
  | "aws-bedrock"
  | "local-compatible"
  | "custom-compatible";

export type AiTask =
  | "profile-summary"
  | "dashboard-insight"
  | "dashboard-chat"
  | "dashboard-action"
  | "chart-label";

export interface AiProviderCapabilities {
  supportsJsonMode: boolean;
  supportsVision: boolean;
  supportsToolCalls: boolean;
  supportsStreaming: boolean;
  maxInputTokens: number;
  costTier: "low" | "medium" | "high";
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  mode: "backend-required" | "local";
  capabilities: AiProviderCapabilities;
}

export interface AiProviderRoute {
  providerId: AiProviderId;
  reason: string;
}

export interface AiProviderHealth {
  providerId: AiProviderId;
  status: "ready" | "demo" | "unavailable";
  message: string;
}

export interface AiGatewayRequest {
  providerId?: AiProviderId;
  fallbackProviderId?: AiProviderId;
  allowedProviders?: AiProviderId[];
  task: AiTask;
  prompt: string;
  fallbackText: string;
  simulateProviderFailure?: boolean;
  customConnection?: AiProviderConnection;
}

export interface AiGatewayResponse {
  content: string;
  model: string;
  provider: AiProviderInfo;
  task: AiTask;
  usedFallback: boolean;
  latencyMs: number;
}

export interface AiProviderConnection {
  endpoint?: string;
  apiKey?: string;
}

const PROVIDERS: AiProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4.1-mini",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: true,
      supportsVision: true,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 128000,
      costTier: "medium"
    }
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    defaultModel: "azure-gpt-4.1-mini",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: true,
      supportsVision: true,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 128000,
      costTier: "medium"
    }
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-3-5-sonnet",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: false,
      supportsVision: true,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 200000,
      costTier: "high"
    }
  },
  {
    id: "google-gemini",
    label: "Google Gemini",
    defaultModel: "gemini-1.5-pro",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: true,
      supportsVision: true,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 1000000,
      costTier: "medium"
    }
  },
  {
    id: "mistral",
    label: "Mistral",
    defaultModel: "mistral-small-latest",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: true,
      supportsVision: false,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 32000,
      costTier: "low"
    }
  },
  {
    id: "aws-bedrock",
    label: "AWS Bedrock",
    defaultModel: "bedrock-claude-sonnet",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: false,
      supportsVision: true,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 200000,
      costTier: "high"
    }
  },
  {
    id: "local-compatible",
    label: "Local / OpenAI-compatible",
    defaultModel: "local-demo-model",
    mode: "local",
    capabilities: {
      supportsJsonMode: true,
      supportsVision: false,
      supportsToolCalls: false,
      supportsStreaming: false,
      maxInputTokens: 16000,
      costTier: "low"
    }
  },
  {
    id: "custom-compatible",
    label: "Custom OpenAI-compatible",
    defaultModel: "custom-compatible-endpoint",
    mode: "backend-required",
    capabilities: {
      supportsJsonMode: true,
      supportsVision: false,
      supportsToolCalls: true,
      supportsStreaming: true,
      maxInputTokens: 128000,
      costTier: "medium"
    }
  }
];

const TASK_DEFAULTS: Record<AiTask, AiProviderId> = {
  "profile-summary": "mistral",
  "dashboard-insight": "anthropic",
  "dashboard-chat": "openai",
  "dashboard-action": "openai",
  "chart-label": "local-compatible"
};

export function listAiProviders(): AiProviderInfo[] {
  return [...PROVIDERS];
}

export function getAiProvider(providerId: AiProviderId): AiProviderInfo | undefined {
  return PROVIDERS.find((provider) => provider.id === providerId);
}

export function routeAiProvider({
  allowedProviders,
  task
}: {
  allowedProviders?: AiProviderId[];
  task: AiTask;
}): AiProviderRoute {
  const defaultProviderId = TASK_DEFAULTS[task];
  if (!allowedProviders?.length || allowedProviders.includes(defaultProviderId)) {
    return {
      providerId: defaultProviderId,
      reason: `${task} uses ${getAiProvider(defaultProviderId)?.label ?? defaultProviderId} by default.`
    };
  }

  return {
    providerId: allowedProviders[0],
    reason: `${task} routed to allowed provider ${getAiProvider(allowedProviders[0])?.label ?? allowedProviders[0]}.`
  };
}

export async function completeAiRequest(request: AiGatewayRequest): Promise<AiGatewayResponse> {
  const startedAt = Date.now();
  const routedProviderId = request.providerId ?? routeAiProvider({ allowedProviders: request.allowedProviders, task: request.task }).providerId;
  const provider = getAiProvider(routedProviderId) ?? getAiProvider("local-compatible");
  const fallbackProvider = getAiProvider(request.fallbackProviderId ?? "local-compatible");

  if (!provider || !fallbackProvider) {
    throw new Error("No AI provider available.");
  }

  const activeProvider = request.simulateProviderFailure ? fallbackProvider : provider;
  const model = activeProvider.id === "custom-compatible" && request.customConnection?.endpoint
    ? "custom-compatible-endpoint"
    : activeProvider.defaultModel;

  return {
    content: request.fallbackText,
    model,
    provider: activeProvider,
    task: request.task,
    usedFallback: activeProvider.id !== provider.id,
    latencyMs: Math.max(1, Date.now() - startedAt)
  };
}

export function checkAiProviderHealth(providerId: AiProviderId, connection?: AiProviderConnection): AiProviderHealth {
  const provider = getAiProvider(providerId);

  if (!provider) {
    return {
      providerId,
      status: "unavailable",
      message: "Provider is not registered."
    };
  }

  if (provider.mode === "local") {
    return {
      providerId,
      status: "ready",
      message: "Local-compatible demo provider ready."
    };
  }

  if (provider.id === "custom-compatible") {
    if (connection?.endpoint && connection.apiKey) {
      return {
        providerId,
        status: "ready",
        message: "Custom provider configured in memory. Backend vault required before production use."
      };
    }

    return {
      providerId,
      status: "unavailable",
      message: "Custom provider needs endpoint and API key."
    };
  }

  return {
    providerId,
    status: "demo",
    message: "Provider registered. Backend secret vault required for live calls."
  };
}
