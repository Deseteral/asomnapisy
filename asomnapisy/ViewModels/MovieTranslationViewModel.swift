import Foundation
import SwiftUI
import OpenAI

@MainActor
@Observable
class MovieTranslationViewModel {
    var subtitleFilePath: URL? = nil {
        didSet { populateMovieDetails(from: subtitleFilePath) }
    }

    var movieDetails = MovieDetails.empty()

    var llmProvider: LLMProvider = .ollama
    var translationMode: TranslationMode = .lineByLine

    // TODO: Check if source language and target lang are the same.
    // TODO: Detect source language from srt file name.
    var sourceLanguage: Language = Language.english

    var concurrency = 1
    let concurrencyRange = 1...9

    var isFetchMovieDetailsButtonDisabled: Bool {
        get { return movieDetails.id.isEmpty }
    }

    var isTranslateButtonDisabled: Bool {
        get { return subtitleFilePath == nil || movieDetails.title.isEmpty }
    }

    func fetchMovieData() async {
        if let details = await TMDBClient().getMovieDetails(by: movieDetails.id) {
            movieDetails = details
        }
    }

    // TODO: This whole flow requires error handling.
    func translate(targetLanguage: Language) async throws {
        guard let subtitleFilePath = subtitleFilePath else { return }

        guard let srtData = SrtData.init(contentsOf: subtitleFilePath) else { return }

        guard let client = llmProvider.getClient() else { return }
        let model = "llama3.1:8b"

        let data = TranslateMovieLineByLine(srtData: srtData, movieDetails: movieDetails, sourceLanguage: sourceLanguage, targetLanguage: targetLanguage, concurrency: 1, llmClient: client, llmIdentifier: model)
        let output = try await translateMovieLineByLine(data: data)
        print(output)
    }

    private func populateMovieDetails(from subtitleFilePath: URL?) {
        guard let filename = subtitleFilePath?.lastPathComponent else {
            movieDetails = MovieDetails.empty()
            return
        }

        let regex = /^(.*?)(?=\s*[\({]|\.[a-z]{2}\.srt$|\.srt$)(?:\s*\((?P<year>\d{4})\))?(?:\s*\{tmdb-(?P<tmdbId>\d+)\})?.*?\.(?:[a-z]{2}\.)?srt$/
        if let result = try? regex.wholeMatch(in: filename) {
            movieDetails = MovieDetails(
                id: String(result.output.tmdbId ?? ""),
                title: String(result.output.1),
                releaseYear: String(result.output.year ?? ""),
                description: "",
                posterUrl: "",
            )

            // Once we get basic data from the file name, go and fetch description and poster from TMDB.
            Task {
                await fetchMovieData()
            }
        }
    }
}

