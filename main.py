from enum import Enum
from math import ceil
import os
import sys
import argparse
import re
from pathlib import Path
from dataclasses import dataclass
from typing import TypeVar
import requests
from rich.progress import track
from rich import print


@dataclass
class AsomnapisyArgs:
    source_lang: str
    target_lang: str
    srt_file_path: str
    model: str | None


@dataclass
class MovieInfo:
    title: str
    year: str | None
    tmdb_id: str | None
    description: str | None


@dataclass
class SrtSubtitle:
    order: int
    timestamp: str
    content: list[str]


@dataclass
class SrtData:
    subtitles: list[SrtSubtitle]

    def get_full_text(self) -> str:
        return "\n".join(flatten(list(map(lambda s: s.content, self.subtitles))))


def main():
    args = parse_args()
    mode_translate(args)


def mode_translate(args: AsomnapisyArgs):
    srt_data = parse_srt_file(args.srt_file_path)
    if srt_data is None:
        exit_with_error("Cannot parse srt file.")
        return

    print(
        f"SRT file estimated token count: {estimate_token_count(srt_data.get_full_text())}\n"
    )

    movie_info = parse_movie_info_from_srt_file_path(args.srt_file_path)

    if movie_info is None:
        exit_with_error("Cannot parse movie info from srt file name.")
        return

    movie_info = enrich_movie_info_with_description(movie_info)

    translated_subtitles: list[SrtSubtitle] = []

    for idx in track(range(len(srt_data.subtitles)), description="Translating…"):
        subtitle = srt_data.subtitles[idx]

        system_prompt = translate_movie_system_prompt(
            movie_info,
            source_lang=args.source_lang,
            target_lang=args.target_lang,
            original_subtitles=srt_data.subtitles,
            current_subtitle_idx=idx,
            surrounding_context_len=5,
        )

        text_to_translate = "\n".join(subtitle.content)
        print(f"[white on dark_blue]{text_to_translate}")

        output = ollama_chat(system_prompt, text_to_translate, args.model)
        print(f"[black on gold1]{output}\n")

        translated_subtitles.append(
            SrtSubtitle(
                order=subtitle.order,
                timestamp=subtitle.timestamp,
                content=output.splitlines(),
            )
        )

    with open("translated.srt", "w") as f:
        _ = f.write(serialize_srt_data(SrtData(subtitles=translated_subtitles)))


def parse_movie_info_from_srt_file_path(file_path: str) -> MovieInfo | None:
    filename = Path(file_path).name
    # TODO: This pattern is stupid. Simplify this.
    pattern = r"^(.*?)(?=\s*[\({]|\.[a-z]{2}\.srt$|\.srt$)(?:\s*\((?P<year>\d{4})\))?(?:\s*\{tmdb-(?P<tmdb_id>\d+)\})?.*?\.(?:[a-z]{2}\.)?srt$"
    match = re.match(pattern, filename)

    if match is None:
        return None

    title = match.group(1).strip()
    year = match.group("year")
    tmdb_id = match.group("tmdb_id")

    return MovieInfo(title, year, tmdb_id, description=None)


def parse_srt_file(srt_file_path: str) -> SrtData | None:
    with open(srt_file_path) as file:
        text = file.read()
    groups = text.split("\n\n")

    subtitles: list[SrtSubtitle] = []

    for group in groups:
        lines = group.splitlines()
        if len(lines) < 3:
            continue

        order = int(lines[0])
        timestamp = lines[1]
        content = lines[2:]

        subtitles.append(SrtSubtitle(order, timestamp, content))

    return SrtData(subtitles)


def serialize_srt_data(srt_data: SrtData) -> str:
    text = ""
    for subtitle in srt_data.subtitles:
        text += "\n".join(
            [
                f"{subtitle.order}",
                subtitle.timestamp,
                "\n".join(subtitle.content),
                "",
                "",
            ]
        )
    return text


class TokenEstimationHeuristic(Enum):
    BY_WORD_COUNT = 1
    BY_CHAR_COUNT = 2


def estimate_token_count(
    text: str,
    heuristic: TokenEstimationHeuristic = TokenEstimationHeuristic.BY_WORD_COUNT,
) -> int:
    match heuristic:
        case TokenEstimationHeuristic.BY_WORD_COUNT:
            # 1000 tokens = ~750 words.
            return int(len(text.split(" ")) / 0.75)
        case TokenEstimationHeuristic.BY_CHAR_COUNT:
            # 1 token = ~4 characters.
            return int(ceil(len(text) / 4))


def enrich_movie_info_with_description(movie_info: MovieInfo) -> MovieInfo:
    if movie_info.tmdb_id is None:
        return movie_info

    token = os.environ.get("TMDB_ACCESS_TOKEN")
    if not token:
        return movie_info

    try:
        url = f"https://api.themoviedb.org/3/movie/{movie_info.tmdb_id}"
        headers = {"Authorization": f"Bearer {token}"}

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        data = response.json()
        overview = data.get("overview")
        if not overview:
            return movie_info

        movie_info.description = overview
        return movie_info
    except Exception:
        print("Could not fetch movie details from TMDB")
        return movie_info


def ollama_chat(system_prompt: str, message: str, model: str | None) -> str:
    url = "http://localhost:11434/v1/chat/completions"
    model = model if model is not None else "gemma4:31b"
    return openai_chat(system_prompt, message, model, url)


def openrouter_chat(system_prompt: str, message: str, model: str | None) -> str:
    url = "https://openrouter.ai/api/v1/chat/completions"
    model = model if model is not None else "google/gemini-2.5-pro"
    return openai_chat(system_prompt, message, model, url)


def openai_chat(system_prompt: str, message: str, model: str, url: str, api_key: str | None) -> str:
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
    }
    headers = {}
    if api_key is not None:
        headers = { "Authorization": f"Bearer {api_key}" }
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def translate_movie_system_prompt(
    movie_info: MovieInfo,
    source_lang: str,
    target_lang: str,
    original_subtitles: list[SrtSubtitle],
    current_subtitle_idx: int,
    surrounding_context_len: int,
) -> str:
    release_year_text = f" released in {movie_info.year}" if movie_info.year else ""

    description_text = (
        f"""
For more context this is the description of the movie:
```
{movie_info.description}
```
    """.strip()
        if movie_info.description
        else ""
    )

    if surrounding_context_len == 0:
        og_start = 0
        og_end = len(original_subtitles)
    else:
        og_start = max(current_subtitle_idx - surrounding_context_len, 0)
        og_end = min(
            current_subtitle_idx + surrounding_context_len, len(original_subtitles)
        )

    original_lines = "\n".join(
        [
            line
            for subtitle in original_subtitles[og_start:og_end]
            for line in subtitle.content
        ]
    )

    return f"""
You are a professional translator and the movie expert. You are going to translate movie subtitles.
The movie we're translating is "{movie_info.title}"{release_year_text}.
{description_text}
You will be translating from {source_lang} to {target_lang}. 
Preserve the meaning, tone, and natural spoken style. Return only the translated subtitles and nothing else.
Sometimes there are new lines in the middle of sentence. They're required to correctly fit subtitles on the display. New lines don't mean anything. Treat those sentences as one sentence. Only full stop/period mean "end of sentence". Preserve new lines for presentation purposes.
I will only give you a couple of lines at the time. Return only the translation of given lines.
Here is a couple of lines before/after the ones I will give you so you'll know what is the context. Translate all subtitles I will give you and then return only the ones I'm asking for."
```
{original_lines}
```
I will now provide the lines that you need to translate. Remember that they're a continuous part of the whole movie. Translate them in the context of the surrounding lines.
    """.strip()


def parse_args() -> AsomnapisyArgs:
    parser = argparse.ArgumentParser(
        prog="asomnapisy",
        description="asomnapisy - translate movie subtitles using local LLMs.",
    )

    _ = parser.add_argument(
        "source_lang",
        help="name of the language to translate from (ex. 'english').",
        type=str,
    )
    _ = parser.add_argument(
        "target_lang",
        help="name of the language to translate to (ex. 'polish').",
        type=str,
    )
    _ = parser.add_argument(
        "srt_file_path", help="path to srt file to translate.", type=str
    )
    _ = parser.add_argument(
        "--model",
        help="name of the LLM that will be used for translation.",
        type=str,
    )

    args = parser.parse_args()
    return AsomnapisyArgs(
        source_lang=args.source_lang,
        target_lang=args.target_lang,
        srt_file_path=args.srt_file_path,
        model=args.model,
    )


def exit_with_error(msg: str):
    print(msg)
    sys.exit(1)


T = TypeVar("T")


def flatten(xss: list[list[T]]) -> list[T]:
    return [x for xs in xss for x in xs]


if __name__ == "__main__":
    main()
