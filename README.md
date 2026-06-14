# asomnapisy

CLI tool for translating movie subtitles using LLMs.

## Features

- Two translation modes: **line-by-line** (one subtitle at a time) and **chunked** (batches of lines with retry logic).
- Supports [OpenRouter](https://openrouter.ai/), [LM Studio](https://lmstudio.ai/) and [Ollama](https://ollama.com/) as LLM providers.
- Provied high quality translations by providing surrounding subtitles for additional translation context.
- Integrates with TMDB to fetch media description for more translation context.
- Batch processing of entire directories (for episodic content for example).

## Usage

```bash
# Translate a single file line by line
asomnapisy translate line-by-line <file.srt> \
  --targetLanguage pl \
  --llmProvider openrouter \
  --model <model-id>

# Translate in chunks (batches)
asomnapisy translate chunked <file.srt> \
  --targetLanguage pl \
  --llmProvider lmstudio \
  --model <model-id>

# Batch translate a directory
asomnapisy translate chunked <directory> \
  --targetLanguage pl \
  --llmProvider ollama \
  --model <model-id>
```

## Setup

Provide these environment variables when required:
- `TMDB_ACCESS_TOKEN` - (required) for movie/series metadata lookup.
- `OPENROUTER_API_KEY` - when using OpenRouter as provider.
- `OLLAMA_URL` - when using Ollama as provider (defaults to `http://localhost:11434`).
- `LMSTUDIO_URL` - when using LM Studio as provider (defaults to `http://localhost:1234`).

## Build
This program is built with [Bun](https://bun.sh), TypeScript, and [Effect](https://effect.website).

No build step required — Bun runs TypeScript directly.

```bash
bun install
bun run src/main.ts --help
```

## License
This project is licensed under the [MIT license](LICENSE).
