import { Config, Data, Layer, Match, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { OpenAiClient } from "@effect/ai-openai";

export class LlmError extends Data.TaggedError("LlmError")<{
  message: string;
  cause?: unknown;
}> {
}

const OllamaOpenAiClient = OpenAiClient.layerConfig({
  apiUrl: Config.string("OLLAMA_URL").pipe(
    Config.withDefault("http://localhost:11434"),
    Config.map((url) => `${url}/v1`),
  ),
  apiKey: Config.succeed(Redacted.make("ollama")),
});

const OpenRouterOpenAiClient = OpenAiClient.layerConfig({
  apiUrl: Config.succeed("https://openrouter.ai/api/v1"),
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
  transformClient: (client) =>
    client.pipe(HttpClient.mapRequest(HttpClientRequest.setHeader("X-OpenRouter-Title", "asomnapisy"))),
});

export const LLM_PROVIDERS = ["ollama", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function makeOpenAiClientLayer(provider: LlmProvider) {
  return Match.value(provider).pipe(
    Match.when("ollama", () => OllamaOpenAiClient),
    Match.when("openrouter", () => OpenRouterOpenAiClient),
    Match.exhaustive,
  );
}
