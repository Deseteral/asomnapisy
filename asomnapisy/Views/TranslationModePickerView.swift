import SwiftUI

struct TranslationModePickerView: View {
    @State private var selectedMode: TranslationMode = .lineByLine

    var body: some View {
        Picker("Translation mode", selection: $selectedMode) {
            ForEach(TranslationMode.allCases) { mode in
                Text(mode.displayName).tag(mode.id)
            }
        }
        .pickerStyle(.menu)
    }
}

#Preview {
    TranslationModePickerView()
}
