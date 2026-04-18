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

    var isFetchMovieDetailsButtonDisabled: Bool {
        get {
            return tmdbId.isEmpty
        }
    }
}
