import SwiftUI

struct MovieTranslationView: View {

    @State private var concurrency = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            GroupBox {
                VStack {
                    FilePickerView()
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .topLeading)
            } label: {
                Label("Source subtitles", systemImage: "text.bubble")
            }

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
            } label: {
                Label("Translation", systemImage: "translate")
            }

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
            } label: {
                Label("Advanced settings", systemImage: "bolt.fill")
            }

            Spacer()
            HStack {
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

#Preview {
    MovieTranslationView()
}
