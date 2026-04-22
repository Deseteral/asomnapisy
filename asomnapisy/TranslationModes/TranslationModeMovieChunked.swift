import Foundation
import OpenAI

fileprivate struct ChunkPrompt: Encodable {
    let context_before: String
    let translate_this: [String]
    let context_after: String
}

fileprivate struct ChunkResponse: Decodable {
    let translations: [String]
}

func translateMovieChunked(data: TranslateMovieData, params: TranslateMovieChunkedParams) async throws -> SrtData {
    let systemPrompt = chunkedSystemPrompt(data: data)
    let subtitles = data.srtData.subtitles
    var translatedSubtitles: [SrtSubtitle] = []

    for chunkStart in stride(from: 0, to: subtitles.count, by: params.chunkSize) {
        let chunkEnd = min(chunkStart + params.chunkSize, subtitles.count)

        let currentChunk = subtitles[chunkStart..<chunkEnd]
        let contextBefore = subtitles[max(chunkStart - params.contextSize, 0)..<chunkStart]
        let contextAfter = subtitles[chunkEnd..<min(chunkEnd + params.contextSize, subtitles.count)]

        let payload = ChunkPrompt(
            context_before: contextBefore.map { $0.getFullText() }.joined(separator: "\n"),
            translate_this: currentChunk.map { $0.getFullText() },
            context_after: contextAfter.map { $0.getFullText() }.joined(separator: "\n")
        )

        let prompt = String(data: try JSONEncoder().encode(payload), encoding: .utf8)!

        let messages: [ChatQuery.ChatCompletionMessageParam] = [
            .system(.init(content: .textContent(systemPrompt))),
            .user(.init(content: .string(prompt)))
        ]

        let query = ChatQuery(messages: messages, model: data.llmIdentifier, responseFormat: .jsonObject)
        let result = try await data.llmClient.chats(query: query)
        let output = result.choices.first?.message.content ?? ""
        print(output)

        if let response = try? JSONDecoder().decode(ChunkResponse.self, from: Data(output.utf8)), response.translations.count == currentChunk.count {
            for (og, text) in zip(currentChunk, response.translations) {
                translatedSubtitles.append(SrtSubtitle(
                    order: og.order,
                    timestamp: og.timestamp,
                    content: text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init),
                ))
            }
        } else {
            print("WARNING: Failed to translate chunk at index \(chunkStart). Keeping original subtitles.")
            translatedSubtitles.append(contentsOf: currentChunk)
        }
    }

    return SrtData(subtitles: translatedSubtitles)
}

fileprivate func chunkedSystemPrompt(data: TranslateMovieData) -> String {
    let yearText = if !data.movieDetails.releaseYear.isEmpty { " (\(data.movieDetails.releaseYear))" } else { "" }
    let descriptionText = if !data.movieDetails.description.isEmpty { "Description: \(data.movieDetails.description)" } else { "" }

    return """
        You are a professional movie translator (\(data.sourceLanguage.name) to \(data.targetLanguage.name)).
        Movie: \(data.movieDetails.title)\(yearText)
        \(descriptionText)

        Rules:
        - Input is a JSON object with 'context_before', 'translate_this', and 'context_after'.
        - Use context for accuracy, but ONLY translate strings in the 'translate_this' array.
        - Return a JSON object with a single key 'translations' containing the array of translated strings.
        - Parity is mandatory: the output array length MUST match the input 'translate_this' length.
        - Preserve the tone and natural spoken style.
        - Preserve '\\n' line breaks.
        """
}
