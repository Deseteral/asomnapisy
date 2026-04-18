import SwiftUI

struct MovieTranslationView: View {
    @State private var vm = MovieTranslationViewModel()
    @AppStorage("defaultTargetLangauge") private var targetLanguage: Language = Language.init(rawValue: "en")!

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox {
                VStack {
                    FilePickerView(selectedFile: $vm.subtitleFilePath)

                    Divider()

                    HStack(alignment: .top) {
                        Form {
                            Text("Movie details")
                                .fontWeight(.bold)

                            HStack {
                                TextField("TMDB ID", text: $vm.tmdbId)
                                Button("Fetch data") {
                                    vm.fetchMovieData()
                                }
                                .disabled(vm.isFetchMovieDetailsButtonDisabled)
                            }
                            TextField("Title", text: $vm.movieTitle)
                            TextField("Release year", text: $vm.movieReleaseYear)
                            TextField("Description", text: $vm.movieDescription, axis: .vertical)
                                .lineLimit(5, reservesSpace: true)
                        }

                        AsyncImage(url: URL(string: vm.moviePosterUrl)) { image in
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
                        LLMProviderPickerView(selectedProvider: $vm.llmProvider)
                        TranslationModePickerView(selectedMode: $vm.translationMode)
                    }

                    HStack {
                        LanguagePickerView(label: nil, selectedLanguage: $vm.sourceLanguage)
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
                    Stepper("Concurrency: \(vm.concurrency)", value: $vm.concurrency, in: vm.concurrencyRange)
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
                    vm.translate()
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.isTranslateButtonDisabled)
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
