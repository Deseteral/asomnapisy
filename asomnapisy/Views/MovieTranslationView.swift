import SwiftUI

struct MovieTranslationView: View {
    @State private var vm = MovieTranslationViewModel()
    @AppStorage("defaultTargetLangauge") private var targetLanguage: Language = Language.english

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
                                TextField("TMDB ID", text: $vm.movieDetails.id)
                                Button("Fetch data") {
                                    onFetchMovieDataButtonPressed()
                                }
                                .disabled(vm.isFetchMovieDetailsButtonDisabled)
                            }
                            TextField("Title", text: $vm.movieDetails.title)
                            TextField("Release year", text: $vm.movieDetails.releaseYear)
                            TextField("Description", text: $vm.movieDetails.description, axis: .vertical)
                                .lineLimit(5, reservesSpace: true)
                        }

                        AsyncImage(url: URL(string: vm.movieDetails.posterUrl)) { image in
                            image.resizable().scaledToFit()
                        } placeholder: {
                            Color.gray
                        }
                        .frame(width: 130, height: 196)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Source", systemImage: "text.bubble") }

            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        TranslationModePickerView(selectedMode: $vm.translationMode)
                        LLMProviderPickerView(selectedProvider: $vm.llmProvider)
                    }

                    HStack {
                        Text("Language")
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
                    switch vm.translationMode {
                        case .lineByLine:
                            Form {
                                // TODO: Set concurrency range somewhere else.
                                Stepper("Concurrency: \(vm.translateMovieLineByLineParams.concurrency)", value: $vm.translateMovieLineByLineParams.concurrency, in: 1...9)
                                    .monospacedDigit()

                                Stepper("Before/after lines (additional context): \(vm.translateMovieLineByLineParams.surroundingContextLength)", value: $vm.translateMovieLineByLineParams.surroundingContextLength, in: 1...Int.max)
                                    .monospacedDigit()
                            }
                        case .chunked:
                            Text("chunked")
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Mode settings", systemImage: "pencil.line") }

            Spacer()

            HStack {
//                Text("Estimated token count: 123K (input), 456K (output)")
//                Divider()
//                Text("Estimated cost: $6.45")
//                Divider()

                Button("Translate", role: .destructive) {
                    onTranslateButtonPressed()
                }
                .buttonStyle(.borderedProminent)
                .disabled(vm.isTranslateButtonDisabled)
            }
            .frame(maxWidth: .infinity, alignment: .bottomTrailing)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    func onFetchMovieDataButtonPressed() {
        Task {
            await vm.fetchMovieData()
        }
    }

    func onTranslateButtonPressed() {
        Task {
            try await vm.translate(targetLanguage: targetLanguage)
        }
    }
}

#Preview {
    MovieTranslationView()
}
