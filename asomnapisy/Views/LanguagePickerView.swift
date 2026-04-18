import SwiftUI

struct LanguagePickerView: View {
    @State private var selectedLanguage = "en"

    var body: some View {
        Picker("", selection: $selectedLanguage) {
            ForEach(Language.allLanguages) { lang in
                Text(lang.name).tag(lang.id)
            }
        }
        .labelsHidden()
        .pickerStyle(.menu)
        .frame(width: 150)
    }
}
