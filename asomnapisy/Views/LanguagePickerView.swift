import SwiftUI

struct LanguagePickerView: View {
    @Binding var selectedLanguage: Language

    var body: some View {
        Picker("", selection: $selectedLanguage) {
            ForEach(Language.allLanguages) { lang in
                Text(lang.name).tag(lang)
            }
        }
        .labelsHidden()
        .pickerStyle(.menu)
        .frame(width: 150)
    }
}
