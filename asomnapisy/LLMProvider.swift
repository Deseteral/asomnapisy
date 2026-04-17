enum LLMProvider: Identifiable, CaseIterable {
    case ollama
    case openrouter

    var id: Self { self }

    var displayName: String {
        get {
            switch self {
                case .ollama:
                    return "Ollama"
                case .openrouter:
                    return "OpenRouter"
            }
        }
    }
}
