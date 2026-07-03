import { describe, expect, it } from "vitest";
import {
  checkAiProviderHealth,
  completeAiRequest,
  getAiProvider,
  listAiProviders,
  routeAiProvider
} from "./brisk";

describe("Brisk AI provider gateway", () => {
  it("lists supported model providers with capabilities", () => {
    const providers = listAiProviders();
    const providerIds = providers.map((provider) => provider.id);

    expect(providerIds).toEqual(expect.arrayContaining([
      "openai",
      "azure-openai",
      "anthropic",
      "google-gemini",
      "mistral",
      "aws-bedrock",
      "local-compatible",
      "custom-compatible"
    ]));
    expect(getAiProvider("openai")).toMatchObject({
      id: "openai",
      label: "OpenAI",
      capabilities: {
        supportsJsonMode: true,
        supportsToolCalls: true
      }
    });
    expect(getAiProvider("local-compatible")?.capabilities.costTier).toBe("low");
    expect(getAiProvider("custom-compatible")?.label).toBe("Custom OpenAI-compatible");
  });

  it("routes tasks to suitable default providers", () => {
    expect(routeAiProvider({ task: "profile-summary" }).providerId).toBe("mistral");
    expect(routeAiProvider({ task: "dashboard-insight" }).providerId).toBe("anthropic");
    expect(routeAiProvider({ task: "chart-label" }).providerId).toBe("local-compatible");
    expect(routeAiProvider({ task: "dashboard-action", allowedProviders: ["google-gemini"] }).providerId).toBe("google-gemini");
  });

  it("completes the same request through different providers", async () => {
    const openaiResponse = await completeAiRequest({
      providerId: "openai",
      task: "dashboard-chat",
      prompt: "Which segment is strongest?",
      fallbackText: "North is strongest."
    });
    const anthropicResponse = await completeAiRequest({
      providerId: "anthropic",
      task: "dashboard-chat",
      prompt: "Which segment is strongest?",
      fallbackText: "North is strongest."
    });

    expect(openaiResponse.content).toBe("North is strongest.");
    expect(anthropicResponse.content).toBe("North is strongest.");
    expect(openaiResponse.provider.id).toBe("openai");
    expect(anthropicResponse.provider.id).toBe("anthropic");
    expect(openaiResponse.model).not.toBe(anthropicResponse.model);
  });

  it("falls back when selected provider is unavailable", async () => {
    const response = await completeAiRequest({
      providerId: "openai",
      fallbackProviderId: "local-compatible",
      task: "dashboard-chat",
      prompt: "Show top region",
      fallbackText: "North leads revenue.",
      simulateProviderFailure: true
    });

    expect(response.provider.id).toBe("local-compatible");
    expect(response.usedFallback).toBe(true);
    expect(response.content).toBe("North leads revenue.");
  });

  it("reports provider health without requiring frontend secrets", () => {
    expect(checkAiProviderHealth("openai")).toMatchObject({
      providerId: "openai",
      status: "demo"
    });
    expect(checkAiProviderHealth("local-compatible")).toMatchObject({
      providerId: "local-compatible",
      status: "ready"
    });
    expect(checkAiProviderHealth("custom-compatible")).toMatchObject({
      providerId: "custom-compatible",
      status: "unavailable"
    });
    expect(checkAiProviderHealth("custom-compatible", {
      endpoint: "https://llm.example.com/v1",
      apiKey: "test-key"
    })).toMatchObject({
      providerId: "custom-compatible",
      status: "ready"
    });
  });

  it("runs custom-compatible requests with endpoint metadata", async () => {
    const response = await completeAiRequest({
      providerId: "custom-compatible",
      task: "dashboard-chat",
      prompt: "Explain revenue",
      fallbackText: "Revenue declined.",
      customConnection: {
        endpoint: "https://llm.example.com/v1",
        apiKey: "test-key"
      }
    });

    expect(response.provider.id).toBe("custom-compatible");
    expect(response.model).toBe("custom-compatible-endpoint");
    expect(response.content).toBe("Revenue declined.");
  });
});
