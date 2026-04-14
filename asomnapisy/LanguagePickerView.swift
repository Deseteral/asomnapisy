import SwiftUI

struct LanguagePickerView: View {
    public let label: String

    @State private var selectedLanguage = "en"

    var body: some View {
        VStack(alignment: .leading) {
            Picker(label, selection: $selectedLanguage) {
                ForEach(Language.allLanguages) { lang in
                    Text(lang.name).tag(lang.id)
                }
            }
            .pickerStyle(.menu)
            .frame(width: 150)
        }
    }
}
