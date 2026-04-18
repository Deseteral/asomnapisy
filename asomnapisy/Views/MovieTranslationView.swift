import SwiftUI

struct MovieTranslationView: View {
    @State private var viewModel = ViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox {
                VStack {
                    FilePickerView(selectedFile: $viewModel.subtitleFilePath)

                    Divider()

                    HStack(alignment: .top) {
                        Form {
                            Text("Movie details")
                                .fontWeight(.bold)

                            HStack {
                                TextField("TMDB ID", text: $viewModel.tmdbId)
                                Button("Fetch data") {
                                    viewModel.fetchMovieData()
                                }
                                .disabled(viewModel.isFetchMovieDetailsButtonDisabled)
                            }
                            TextField("Title", text: $viewModel.movieTitle)
                            TextField("Release year", text: $viewModel.movieReleaseYear)
                            TextField("Description", text: $viewModel.movieDescription, axis: .vertical)
                                .lineLimit(5, reservesSpace: true)
                        }

                        AsyncImage(url: URL(string: viewModel.moviePosterUrl)) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Color.gray
                        }
                        .frame(width: 130, height: 196)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Source subtitles", systemImage: "text.bubble") }

            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        LLMProviderPickerView(selectedProvider: $viewModel.llmProvider)
                        TranslationModePickerView(selectedMode: $viewModel.translationMode)
                    }

                    HStack {
                        LanguagePickerView(label: nil, selectedLanguage: $viewModel.sourceLanguage)
                            .frame(width: 150)
                        Image(systemName: "arrowshape.right")
                        LanguagePickerView(label: nil, selectedLanguage: $targetLanguage)
                            .frame(width: 150)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Translation", systemImage: "translate") }

            GroupBox {
                VStack(alignment: .leading) {
                    Stepper("Concurrency: \(viewModel.concurrency)", value: $viewModel.concurrency, in: viewModel.concurrencyRange)
                        .monospacedDigit()
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Advanced settings", systemImage: "bolt.fill") }

            Spacer()

            HStack {
//                Text("Estimated token count: 123K (input), 456K (output)")
//                Divider()
//                Text("Estimated cost: $6.45")
//                Divider()

                Button("Translate", role: .destructive) {
                    viewModel.translate()
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isTranslateButtonDisabled)
            }
            .frame(maxWidth: .infinity, alignment: .bottomTrailing)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

#Preview {
    MovieTranslationView()
}
