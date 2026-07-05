import { Config, Layer, Match, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import type { LanguageModel } from "@effect/ai";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import type { ConfigError } from "effect/ConfigError";

export const LLM_PROVIDERS = ["ollama", "lmstudio", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type LanguageModelOptions = {
  provider: LlmProvider;
  model: string;
  reasoning: boolean;
  sessionId?: string;
};

type LlmClientLayer = Layer.Layer<OpenAiClient.OpenAiClient, ConfigError, HttpClient.HttpClient>;

export function makeLanguageModelLayer(
  options: LanguageModelOptions,
): Layer.Layer<LanguageModel.LanguageModel, ConfigError, HttpClient.HttpClient> {
  const client = Match.value(options.provider).pipe(
    Match.when("ollama", () => makeOllamaClient()),
    Match.when("lmstudio", () => makeLmStudioClient()),
    Match.when("openrouter", () => makeOpenRouterClient(options.sessionId)),
    Match.exhaustive,
  );

  return OpenAiLanguageModel
    .model(options.model, { reasoning: { effort: options.reasoning ? "minimal" : "none" } })
    .pipe(Layer.provide(client));
}

function makeOllamaClient(): LlmClientLayer {
  return OpenAiClient.layerConfig({
    apiUrl: Config.string("OLLAMA_URL").pipe(
      Config.withDefault("http://localhost:11434"),
      Config.map((url) => `${url}/v1`),
    ),
    apiKey: Config.succeed(Redacted.make("ollama")),
  });
}

function makeLmStudioClient(): LlmClientLayer {
  return OpenAiClient.layerConfig({
    apiUrl: Config.string("LMSTUDIO_URL").pipe(
      Config.withDefault("http://localhost:1234"),
      Config.map((url) => `${url}/v1`),
    ),
    apiKey: Config.succeed(Redacted.make("lmstudio")),
  });
}

function makeOpenRouterClient(sessionId?: string): LlmClientLayer {
  const headers: Record<string, string> = {
    "X-OpenRouter-Title": "asomnapisy",
    ...(sessionId && { "X-Session-Id": sessionId }),
  };

  return OpenAiClient.layerConfig({
    apiUrl: Config.succeed("https://openrouter.ai/api/v1"),
    apiKey: Config.redacted("OPENROUTER_API_KEY"),
    transformClient: (client) => client.pipe(
      HttpClient.mapRequest(HttpClientRequest.setHeaders(headers)),
    ),
  });
}
