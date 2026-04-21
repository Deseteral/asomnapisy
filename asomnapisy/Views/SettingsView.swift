import SwiftUI

struct SettingsView: View {
    @AppStorage("defaultTargetLangauge") private var defaultTargetLangauge: Language = Language.english
    @SecureStorage("tmdbAccessToken") private var tmdbAccessToken: String = ""
    @SecureStorage("openRouterKey") private var openRouterKey: String = ""
    @AppStorage("ollamaInstanceUrl") private var ollamaInstanceUrl: String = ""

    var body: some View {
        TabView {
            Tab("Translation", systemImage: "translate") {
                Form {
                    LanguagePickerView(label: "Default target language", selectedLanguage: $defaultTargetLangauge)
                }
            }

            Tab("Media sources", systemImage: "book.closed.fill") {
                Form {
                    SecureField("TMDB access token", text: $tmdbAccessToken)
                }
            }

            Tab("LLM providers", systemImage: "sparkles") {
                Form {
                    TextField("Ollama instance URL", text: $ollamaInstanceUrl)
                    SecureField("OpenRouter key", text: $openRouterKey)
                }
            }
        }
        .scenePadding()
        .frame(maxWidth: 450, minHeight: 100)
    }
}

#Preview {
    SettingsView()
}
