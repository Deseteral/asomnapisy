import Foundation
import SwiftUI
import OpenAI

@MainActor
@Observable
class MovieTranslationViewModel {
    var subtitleFilePath: URL? = nil {
        didSet { populateMovieDetails(from: subtitleFilePath) }
    }

    var tmdbId: String = ""
    var movieTitle: String = ""
    var movieReleaseYear: String = ""
    var movieDescription: String = ""
    var moviePosterUrl: String = ""

    var llmProvider: LLMProvider = .ollama
    var translationMode: TranslationMode = .lineByLine

    // TODO: Check if source language and target lang are the same.
    // TODO: Detect source language from srt file name.
    var sourceLanguage: Language = Language.init(rawValue: "en")!

    var concurrency = 1
    let concurrencyRange = 1...9

    var isFetchMovieDetailsButtonDisabled: Bool {
        get { return tmdbId.isEmpty }
    }

    var isTranslateButtonDisabled: Bool {
        get { return subtitleFilePath == nil || movieTitle.isEmpty }
    }

    func fetchMovieData() {
        Task {
            let client = TMDBClient()
            guard let details = await client.getMovieDetails(by: tmdbId) else { return }
            movieTitle = details.title
            movieReleaseYear = details.releaseYear ?? ""
            movieDescription = details.description ?? ""
            moviePosterUrl = details.posterUrl ?? ""
        }
    }

    func translate(targetLanguage: Language) async throws {
        guard let subtitleFilePath = subtitleFilePath else { return }

        guard let srtData = SrtData.init(contentsOf: subtitleFilePath) else { return }
        let movieDetails = MovieDetails(id: tmdbId, title: movieTitle, releaseYear: movieReleaseYear, description: movieDescription, posterUrl: moviePosterUrl)

        let client = OpenAI(configuration: .init(token: "ollama", host: "localhost", port: 11434, scheme: "http", basePath: "v1", parsingOptions: .fillRequiredFieldIfKeyNotFound))
        let model = "llama3.1:8b"

        let data = TranslateMovieLineByLine(srtData: srtData, movieDetails: movieDetails, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, concurrency: 1, llmClient: client, llmIdentifier: model)
        let output = try await translateMovieLineByLine(data: data)
        print(output)
    }

    private func populateMovieDetails(from subtitleFilePath: URL?) {
        guard let filename = subtitleFilePath?.lastPathComponent else {
            tmdbId = ""
            movieTitle = ""
            movieReleaseYear = ""
            movieDescription = ""
            moviePosterUrl = ""
            return
        }


        let regex = /^(.*?)(?=\s*[\({]|\.[a-z]{2}\.srt$|\.srt$)(?:\s*\((?P<year>\d{4})\))?(?:\s*\{tmdb-(?P<tmdbId>\d+)\})?.*?\.(?:[a-z]{2}\.)?srt$/
        if let result = try? regex.wholeMatch(in: filename) {
            movieTitle = String(result.output.1)
            tmdbId = String(result.output.tmdbId ?? "")
            movieReleaseYear = String(result.output.year ?? "")

            fetchMovieData()
        }
    }
}

