import SwiftUI

struct SettingsView: View {
    @AppStorage("defaultTargetLangauge") private var defaultTargetLangauge: Language = Language.init(rawValue: "en")!
    @SecureStorage("tmdbAccessToken") private var tmdbAccessToken: String = ""
    @SecureStorage("openRouterKey") private var openRouterKey: String = ""

    var body: some View {
        Form {
            LanguagePickerView(label: "Default target language", selectedLanguage: $defaultTargetLangauge)
            SecureField("TMDB access token", text: $tmdbAccessToken)
            SecureField("OpenRouter key", text: $openRouterKey)
        }
        .scenePadding()
        .frame(maxWidth: 350, minHeight: 100)
    }
}

#Preview {
    SettingsView()
}
