import OpenAI

enum TranslationMode: Identifiable, CaseIterable {
    case lineByLine
    case chunked

    var id: Self { self }

    var displayName: String {
        get {
            switch self {
                case .lineByLine:
                    return "Line by line"
                case .chunked:
                    return "Chunked"
            }
        }
    }
}

struct TranslateMovieData {
    let srtData: SrtData
    let movieDetails: MovieDetails
    let sourceLanguage: Language
    let targetLanguage: Language
    let llmClient: OpenAI
    let llmIdentifier: String
}

struct TranslateMovieLineByLineParams {
    var surroundingContextLength: Int = 5
    var concurrency: Int = 1
}

struct TranslateMovieChunkedParams {
    var chunkSize: Int = 30
    var contextSize: Int = 4
    var maxRetries: Int = 3
}
