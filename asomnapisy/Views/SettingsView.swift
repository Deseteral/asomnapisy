import SwiftUI

struct SettingsView: View {
    @AppStorage("defaultTargetLangauge") private var defaultTargetLangauge: Language = Language.init(rawValue: "en")!
    @SecureStorage("tmdbAccessToken") private var tmdbAccessToken: String = ""
    @SecureStorage("openRouterKey") private var openRouterKey: String = ""
    @AppStorage("ollamaInstanceUrl") private var ollamaInstanceUrl: String = ""

    var body: some View {
        Form {
            Section("Translation") {
                LanguagePickerView(label: "Default target language", selectedLanguage: $defaultTargetLangauge)
            }

            Section("Media sources") {
                SecureField("TMDB access token", text: $tmdbAccessToken)
            }

            Section("LLM providers") {
                TextField("Ollama instance URL", text: $ollamaInstanceUrl)
                SecureField("OpenRouter key", text: $openRouterKey)
            }
        }
        .scenePadding()
        .frame(maxWidth: 450, minHeight: 100)
    }
}

#Preview {
    SettingsView()
}
