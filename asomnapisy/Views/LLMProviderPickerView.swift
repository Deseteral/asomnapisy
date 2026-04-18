import SwiftUI

struct LLMProviderPickerView: View {
    @Binding var selectedProvider: LLMProvider

    var body: some View {
        Picker("LLM provider", selection: $selectedProvider) {
            ForEach(LLMProvider.allCases) { provider in
                Text(provider.displayName).tag(provider.id)
            }
        }
        .pickerStyle(.menu)
    }
}
