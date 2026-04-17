import SwiftUI

struct MovieTranslationView: View {

    @State private var concurrency = 1

    @State private var tmdbId = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox {
                VStack {
                    FilePickerView()

                    Divider()

                    HStack(alignment: .top) {
                        Form {
                            Text("Movie details")
                                .fontWeight(.bold)

                            HStack {
                                TextField("TMDB ID", text: $tmdbId)
                                Button("Fetch data") {
                                    print("")
                                }
                                .disabled(tmdbId.isEmpty)
                            }
                            TextField("Movie title", text: $tmdbId)
                            TextField("Release year", text: $tmdbId)
                        }

                        AsyncImage(url: URL(string: "https://image.tmdb.org/t/p/w1280/yihdXomYb5kTeSivtFndMy5iDmf.jpg")) { image in
                            image.resizable()
                                .scaledToFit()
                        } placeholder: {
                            Color.gray
                        }
                        .frame(width: 133, height: 200)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Source subtitles", systemImage: "text.bubble") }

            GroupBox {
                VStack(alignment: .leading) {
                    HStack {
                        LanguagePickerView(label: "")
                        Image(systemName: "arrowshape.right")
                        LanguagePickerView(label: "")
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Translation", systemImage: "translate") }

            GroupBox {
                VStack(alignment: .leading) {
                    Stepper(onIncrement: {
                        concurrency = min(concurrency + 1, 9)
                    }, onDecrement: {
                        concurrency = max(concurrency - 1, 1)
                    }, label: { Text("Concurrency: \(concurrency)").monospacedDigit() })
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: { Label("Advanced settings", systemImage: "bolt.fill") }

            Spacer()

            HStack {
                Text("Estimated token count: 123K (input), 456K (output).")
                Divider()
                Text("Estimated cost: $6.45.")

                Divider()

                Button("Translate", role: .destructive) {
                    print("TODO translate!")
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, alignment: .bottomTrailing)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// TODO: Check if source lang and target lang are the same.
// TODO: Set target lang in user preferences.

#Preview {
    MovieTranslationView()
}
