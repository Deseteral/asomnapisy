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
    func getClient(sessionId: String) -> OpenAI? {
        switch self {
            case .ollama:
                guard let instanceUrlString = UserDefaults.standard.string(forKey: "ollamaInstanceUrl") else { return nil }
                guard let url = URL.init(string: instanceUrlString) else { return nil }
                guard let scheme = url.scheme, let host = url.host(), let port = url.port else { return nil }
                return OpenAI(configuration: .init(token: "ollama", host: host, port: port, scheme: scheme, basePath: "v1", parsingOptions: .fillRequiredFieldIfKeyNotFound))
            case .openrouter:
                guard let key = SecureStorage.read("openRouterKey") else { return nil }
                let customHeaders: [String: String] = [
                    "X-OpenRouter-Title": "asomnapisy",
                    "X-Session-ID": sessionId,
                ].compactMapValues { $0 }
                return OpenAI(configuration: .init(token: key, host: "openrouter.ai",  scheme: "https", basePath: "api/v1", customHeaders: customHeaders, parsingOptions: .fillRequiredFieldIfKeyNotFound))
        }
    }
}
