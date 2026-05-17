import { Config, Match, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { OpenAiClient } from "@effect/ai-openai";
import type { ConfigError } from "effect/ConfigError";
import type { Layer } from "effect/Layer";

function makeOllamaClient(): Layer<OpenAiClient.OpenAiClient, ConfigError, HttpClient.HttpClient> {
  return OpenAiClient.layerConfig({
    apiUrl: Config.string("OLLAMA_URL").pipe(
      Config.withDefault("http://localhost:11434"),
      Config.map((url) => `${url}/v1`),
    ),
    apiKey: Config.succeed(Redacted.make("ollama")),
  });
}

function makeOpenRouterClient(sessionId?: string): Layer<OpenAiClient.OpenAiClient, ConfigError, HttpClient.HttpClient> {
  const headers: Record<string, string> = {
    "X-OpenRouter-Title": "asomnapisy",
  };

  if (sessionId) {
    headers["X-Session-Id"] = sessionId;
  }

  return OpenAiClient.layerConfig({
    apiUrl: Config.succeed("https://openrouter.ai/api/v1"),
    apiKey: Config.redacted("OPENROUTER_API_KEY"),
    transformClient: (client) =>
      client.pipe(HttpClient.mapRequest(HttpClientRequest.setHeaders(headers))),
  });
}

export const LLM_PROVIDERS = ["ollama", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function makeOpenAiClientLayer(provider: LlmProvider, sessionId?: string): Layer<OpenAiClient.OpenAiClient, ConfigError, HttpClient.HttpClient> {
  return Match.value(provider).pipe(
    Match.when("ollama", () => makeOllamaClient()),
    Match.when("openrouter", () => makeOpenRouterClient(sessionId)),
    Match.exhaustive,
  );
}
