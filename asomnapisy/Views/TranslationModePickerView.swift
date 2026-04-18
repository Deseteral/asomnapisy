import SwiftUI

struct TranslationModePickerView: View {
    @Binding var selectedMode: TranslationMode

    var body: some View {
        Picker("Translation mode", selection: $selectedMode) {
            ForEach(TranslationMode.allCases) { mode in
                Text(mode.displayName).tag(mode.id)
            }
        }
        .pickerStyle(.menu)
    }
}
