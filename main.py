import os
import sys
import argparse
import re
from pathlib import Path
from dataclasses import dataclass
import requests


@dataclass
class AsomnapisyArgs:
    source_lang: str
    target_lang: str
    srt_file_path: str


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


def main():
    args = parse_args()

    srt_data = parse_srt_file(args.srt_file_path)
    if srt_data is None:
        exit_with_error("Cannot parse srt file.")
        return

    movie_info = parse_movie_info_from_srt_file_path(args.srt_file_path)

    if movie_info is None:
        exit_with_error("Cannot parse movie info from srt file name.")
        return

    movie_info = enrich_movie_info_with_description(movie_info)

    translated_subtitles: list[SrtSubtitle] = []

    for idx in range(len(srt_data.subtitles)):
        # for idx in range(30):
        subtitle = srt_data.subtitles[idx]

        surrounding_context_len = 5

        og_start = max(idx - surrounding_context_len, 0)
        og_end = min(idx + surrounding_context_len, len(srt_data.subtitles) - 1)
        original_lines = [
            line
            for subtitle in srt_data.subtitles[og_start:og_end]
            for line in subtitle.content
        ]

        system_prompt = translate_movie_system_prompt(
            movie_info,
            source_lang=args.source_lang,
            target_lang=args.target_lang,
            original_lines=original_lines,
        )
        # print(system_prompt)
        # print("")

        subtitle_text = "\n".join(subtitle.content)
        print(subtitle_text)

        output = ollama_chat(system_prompt, subtitle_text)
        print(output)
        print("")

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
    file = open(srt_file_path)
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


def enrich_movie_info_with_description(movie_info: MovieInfo) -> MovieInfo:
    if movie_info.tmdb_id is None:
        return movie_info

    try:
        token = os.environ["TMDB_ACCESS_TOKEN"]
        if not token:
            return movie_info

        url = f"https://api.themoviedb.org/3/movie/{movie_info.tmdb_id}"
        headers = {"Authorization": f"Authorization: Bearer {token}"}

        response = requests.get(url, headers=headers)

        data = response.json()
        overview = data["overview"]
        if not overview:
            return movie_info

        movie_info.description = overview
        return movie_info
    except Exception:
        print("Could not fetch movie details from TMDB")
        return movie_info


def ollama_chat(system_prompt: str, message: str) -> str:
    url = "http://localhost:11434/api/chat"
    model = "gemma4:26b"
    # model = "qwen3.5:35b"
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "stream": False,
        "think": False,
    }

    response = requests.post(url, json=data)
    data = response.json()
    return data["message"]["content"]


def translate_movie_system_prompt(
    movie_info: MovieInfo, source_lang: str, target_lang: str, original_lines: list[str]
) -> str:
    joined_lines = "\n".join(original_lines)
    release_year_text = f" released in {movie_info.year}" if movie_info.year else ""
    description_text = (
        f"""
    For more context this is the description of the movie:
    ```
    {movie_info.description}
    ```
    """
        if movie_info.description
        else ""
    )

    return f"""
    You are a professional translator and the movie expert. You are going to translate movie subtitles.
    The movie we're translating is "{movie_info.title}"{release_year_text}.
    {description_text}
    You will be translating from {source_lang} to {target_lang}. 
    Preserve the meaning, tone, and natural spoken style. Return only the translated subtitles and nothing else.
    I will only give you a couple of lines at the time. Translate only what you will receive. Preserve new lines.
    Here is a couple of lines before/after the ones you're translating so you'll know what is the context:"
    ```
    {joined_lines}
    ```
    """


def parse_args() -> AsomnapisyArgs:
    parser = argparse.ArgumentParser(
        prog="asomnapisy",
        description="asomnapisy - translate movie subtitles using local LLMs.",
    )

    _ = parser.add_argument(
        "source_lang",
        help="name of the language to translate from (ex. 'english')",
        type=str,
    )
    _ = parser.add_argument(
        "target_lang",
        help="name of the language to translate to (ex. 'polish')",
        type=str,
    )
    _ = parser.add_argument(
        "srt_file_path", help="path to srt file to translate", type=str
    )

    args = parser.parse_args()
    return AsomnapisyArgs(
        source_lang=args.source_lang,
        target_lang=args.target_lang,
        srt_file_path=args.srt_file_path,
    )


def exit_with_error(msg: str):
    print(msg)
    sys.exit(1)


if __name__ == "__main__":
    main()
