import Foundation

struct MovieDetails: Identifiable {
    let id: String
    let title: String
    let releaseYear: String?
    let description: String?
    let posterUrl: String?
}

class TMDBClient {
    func getMovieDetails(by tmdbId: String) async -> MovieDetails? {
        guard let token = SecureStorage.read("tmdbAccessToken"), !token.isEmpty else {
            print("Could not read TMDB access token from Keychain.")
            return nil
        }

        guard let url = URL(string: "https://api.themoviedb.org/3/movie/\(tmdbId)") else {
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                print("Error while fetching data from TMDB: bad response.")
                return nil
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }

            let title = json["original_title"] as? String ?? ""
            let releaseDate = json["release_date"] as? String
            let overview = json["overview"] as? String
            let posterPath = json["poster_path"] as? String

            let releaseYear: String? = releaseDate?.split(separator: "-").first.map(String.init)
            let posterUrl: String? = if let posterPath = posterPath { "https://image.tmdb.org/t/p/w200\(posterPath)" } else { nil }

            return MovieDetails(
                id: tmdbId,
                title: title,
                releaseYear: releaseYear,
                description: overview,
                posterUrl: posterUrl
            )
        } catch {
            print("Error while fetching data from TMDB: \(error.localizedDescription)")
            return nil
        }
    }
}
