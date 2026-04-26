import { Config, Context, Data, Effect, Layer, Match, Redacted } from "effect";
import OpenAI from "openai";

export class LlmError extends Data.TaggedError("LlmError")<{
  message: string;
  cause?: unknown;
}> {
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionParams = {
  messages: ChatMessage[];
  model: string;
  responseFormat?: "json_object";
};

export class LlmClient extends Context.Tag("LlmClient")<
  LlmClient,
  {
    chatCompletion(params: ChatCompletionParams): Effect.Effect<string, LlmError>;
  }
>() {
}

function chatCompletion(client: OpenAI, params: ChatCompletionParams): Effect.Effect<string, LlmError> {
  return Effect.tryPromise({
    try: () =>
      client.chat.completions.create({
        messages: params.messages,
        model: params.model,
        response_format: params.responseFormat ? { type: params.responseFormat } : undefined,
      }),
    catch: (error) => new LlmError({ message: "Chat completion failed.", cause: error }),
  }).pipe(
    Effect.flatMap((response) => {
      const content = response.choices[0]?.message?.content;
      if (content == null) {
        return Effect.fail(new LlmError({ message: "No content in LLM response." }));
      }
      return Effect.succeed(content);
    }),
  );
}

function makeLlmClientFromOpenAI(client: OpenAI): Context.Tag.Service<typeof LlmClient> {
  return LlmClient.of({
    chatCompletion: (params) => chatCompletion(client, params),
  });
}

export const LlmClientOllamaLive = Layer.effect(
  LlmClient,
  Effect.gen(function* () {
    const url = yield* Config.string("OLLAMA_URL").pipe(Config.withDefault("http://localhost:11434"));
    const client = new OpenAI({ baseURL: `${url}/v1`, apiKey: "ollama" });
    return makeLlmClientFromOpenAI(client);
  }).pipe(
    Effect.mapError((cause) => new LlmError({ message: "Failed to read OLLAMA_URL configuration.", cause })),
  ),
);

export const LlmClientOpenRouterLive = Layer.effect(
  LlmClient,
  Effect.gen(function* () {
    const key = yield* Config.redacted("OPENROUTER_API_KEY").pipe(
      Effect.mapError(() => new LlmError({ message: "OPENROUTER_API_KEY environment variable is not set." })),
    );

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: Redacted.value(key),
      defaultHeaders: { "X-OpenRouter-Title": "asomnapisy" },
    });
    return makeLlmClientFromOpenAI(client);
  }),
);

export const LLM_PROVIDERS = ["ollama", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function makeLlmClientLayer(provider: LlmProvider): Layer.Layer<LlmClient, LlmError> {
  return Match.value(provider).pipe(
    Match.when("ollama", () => LlmClientOllamaLive),
    Match.when("openrouter", () => LlmClientOpenRouterLive),
    Match.exhaustive,
  );
}
