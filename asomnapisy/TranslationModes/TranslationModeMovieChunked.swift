import Foundation
import OpenAI

func translateMovieChunked(data: TranslateMovieData, params: TranslateMovieChunkedParams) async throws -> SrtData {
    let systemPrompt = systemPrompt(data: data)
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

        var messages: [ChatQuery.ChatCompletionMessageParam] = [
            .system(.init(content: .textContent(systemPrompt))),
            .user(.init(content: .string(prompt)))
        ]

        var success = false

        for attempt in 0...params.maxRetries {
            let query = ChatQuery(messages: messages, model: data.llmIdentifier, responseFormat: .jsonObject)
            let result = try await data.llmClient.chats(query: query)
            let output = result.choices.first?.message.content ?? ""
            print(output) // TODO: This is a debug log. Remove.

            do {
                let translations = try decodeChunkResponse(output, expectedCount: currentChunk.count)
                for (og, text) in zip(currentChunk, translations) {
                    translatedSubtitles.append(SrtSubtitle(
                        order: og.order,
                        timestamp: og.timestamp,
                        content: text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init),
                    ))
                }
                success = true
                break
            } catch {
                if attempt < params.maxRetries {
                    print("WARNING: Chunk at index \(chunkStart) failed (attempt \(attempt + 1)/\(params.maxRetries + 1)): \(error.localizedDescription) Retrying...")
                    messages.append(.assistant(.init(content: .textContent(output))))
                    messages.append(.user(.init(content: .string("\(error.localizedDescription) Please fix your response."))))
                }
            }
        }

        if !success {
            print("WARNING: Failed to translate chunk at index \(chunkStart) after \(params.maxRetries + 1) attempts. Keeping original subtitles.")
            translatedSubtitles.append(contentsOf: currentChunk)
        }
    }

    return SrtData(subtitles: translatedSubtitles)
}

fileprivate func decodeChunkResponse(_ output: String, expectedCount: Int) throws -> [String] {
    let response: ChunkResponse
    do {
        response = try JSONDecoder().decode(ChunkResponse.self, from: Data(output.utf8))
    } catch {
        throw ChunkTranslationError.decodingFailed(error.localizedDescription)
    }

    guard response.translations.count == expectedCount else {
        throw ChunkTranslationError.countMismatch(expected: expectedCount, got: response.translations.count)
    }

    return response.translations
}

fileprivate enum ChunkTranslationError: LocalizedError {
    case decodingFailed(String)
    case countMismatch(expected: Int, got: Int)

    var errorDescription: String? {
        switch self {
            case .decodingFailed(let reason):
                return "Failed to decode response as JSON: \(reason)"
            case .countMismatch(let expected, let got):
                return "Expected \(expected) translations but got \(got)."
        }
    }
}

fileprivate func systemPrompt(data: TranslateMovieData) -> String {
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

fileprivate struct ChunkPrompt: Encodable {
    let context_before: String
    let translate_this: [String]
    let context_after: String
}

fileprivate struct ChunkResponse: Decodable {
    let translations: [String]
}
