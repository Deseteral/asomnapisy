import Foundation
import SwiftUI

@Observable
class ViewModel {
    var subtitleFilePath: URL? = nil

    var tmdbId: String = ""
    var movieTitle: String = ""
    var movieReleaseYear: String = ""
    var movieDescription: String = ""
    var moviePosterUrl: String = "https://image.tmdb.org/t/p/w1280/yihdXomYb5kTeSivtFndMy5iDmf.jpg"

    var llmProvider: LLMProvider = .ollama
    var translationMode: TranslationMode = .lineByLine

    // TODO: Check if source lang and target lang are the same.
    // TODO: Set target lang in user preferences.
    var sourceLanguage: Language = Language(id: "en", name: "English")
    var targetLanguage: Language = Language(id: "en", name: "English")

    var concurrency = 1
    let concurrencyRange = 1...9

    var isFetchMovieDetailsButtonDisabled: Bool {
        get {
            return tmdbId.isEmpty
        }
    }

    var isTranslateButtonDisabled: Bool {
        get {
            return subtitleFilePath == nil || movieTitle.isEmpty
        }
    }

    func fetchMovieData() {
        print("TODO")
    }

    func translate() {
        print("TODO")
    }
}

