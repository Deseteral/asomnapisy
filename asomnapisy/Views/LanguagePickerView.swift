import SwiftUI

struct LanguagePickerView: View {
    let label: String?
    @Binding var selectedLanguage: Language

    var body: some View {
        Picker(label ?? "", selection: $selectedLanguage) {
            ForEach(Language.allLanguages) { lang in
                Text(lang.name).tag(lang)
            }
        }
        .labelsVisibility(label == nil ? .hidden : .visible)
        .pickerStyle(.menu)
    }
}
