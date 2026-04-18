import SwiftUI

struct SettingsView: View {
    @AppStorage("defaultTargetLangauge") private var defaultTargetLangauge: Language = Language.init(rawValue: "en")!

    var body: some View {
        Form {
            LanguagePickerView(label: "Default target language", selectedLanguage: $defaultTargetLangauge)
        }
        .scenePadding()
        .frame(maxWidth: 350, minHeight: 100)
    }
}

#Preview {
    SettingsView()
}
