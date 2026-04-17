import SwiftUI

struct LLMProviderPickerView: View {
    @State private var selectedProvider: LLMProvider = .ollama

    var body: some View {
        Picker("LLM provider", selection: $selectedProvider) {
            ForEach(LLMProvider.allCases) { provider in
                Text(provider.displayName).tag(provider.id)
            }
        }
        .pickerStyle(.menu)
    }
}

#Preview {
    LLMProviderPickerView()
}
