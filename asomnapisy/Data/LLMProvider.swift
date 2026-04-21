import Foundation
import OpenAI

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

extension LLMProvider {
    func getClient() -> OpenAI? {
        switch self {
            case .ollama:
                return OpenAI(configuration: .init(token: "ollama", host: "localhost", port: 11434, scheme: "http", basePath: "v1", parsingOptions: .fillRequiredFieldIfKeyNotFound))
            case .openrouter:
                guard let key = SecureStorage.read("openRouterKey") else { return nil }
                return OpenAI(configuration: .init(token: key, host: "openrouter.ai",  scheme: "https", basePath: "api/v1", parsingOptions: .fillRequiredFieldIfKeyNotFound))
        }
    }
}
