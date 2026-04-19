import OpenAI

struct TranslateMovieLineByLine {
    let srtData: SrtData
    let movieDetails: MovieDetails
    let sourceLanguage: Language
    let targetLanguage: Language
    let concurrency: Int
    let llmClient: OpenAI
    let llmModel: Model
}

func translateMovieLineByLine(data: TranslateMovieLineByLine) -> SrtData {
    let translatedSubtitles = data.srtData.subtitles.enumerated().map { (idx, subtitle) in
        let systemPrompt = systemPrompt(data: data, currentSubtitleIdx: idx, surroundingContextLength: 5)
        let textToTranslate = subtitle.content.joined(separator: "\n")

        let output = "" // TODO: Hook up LLM here.

        return SrtSubtitle(
            order: subtitle.order,
            timestamp: subtitle.timestamp,
            content: output.split(separator: "\n").map(String.init)
        )
    }

    return SrtData(subtitles: translatedSubtitles)
}

fileprivate func systemPrompt(data: TranslateMovieLineByLine, currentSubtitleIdx: Int, surroundingContextLength: Int) -> String {
    let releaseYearText = if let year = data.movieDetails.releaseYear { " released in \(year)" } else { "" }
    let descriptionText = if let description = data.movieDetails.description {
        """
        For more context this is the description of the movie:
        ```
        \(description)
        ```
        """
    } else { "" }

    let (ogStart, ogEnd) = if surroundingContextLength == 0 {
        (0, data.srtData.subtitles.count)
    } else {
        (
            max(currentSubtitleIdx - surroundingContextLength, 0),
            min(currentSubtitleIdx + surroundingContextLength, data.srtData.subtitles.count)
        )
    }

    let originalLines = data.srtData.subtitles[ogStart..<ogEnd].flatMap { $0.content }.joined(separator: "\n")

    return """
        You are a professional translator and the movie expert. You are going to translate movie subtitles.
        The movie we're translating is "\(data.movieDetails.title)"\(releaseYearText).
        \(descriptionText)
        You will be translating from \(data.sourceLanguage.name) to \(data.targetLanguage.name).
        Preserve the meaning, tone, and natural spoken style. Return only the translated subtitles and nothing else.
        Sometimes there are new lines in the middle of sentence. They're required to correctly fit subtitles on the display. New lines don't mean anything. Treat those sentences as one sentence. Only full stop/period mean "end of sentence". Preserve new lines for presentation purposes.
        I will only give you a couple of lines at the time. Return only the translation of given lines.
        Here is a couple of lines before/after the ones I will give you so you'll know what is the context. Translate all subtitles I will give you and then return only the ones I'm asking for."
        ```
        \(originalLines)
        ```
        I will now provide the lines that you need to translate. Remember that they're a continuous part of the whole movie. Translate them in the context of the surrounding lines.
        """
}
