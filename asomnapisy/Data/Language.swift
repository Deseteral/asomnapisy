import Foundation

struct Language: Identifiable, Hashable, RawRepresentable {
    let id: String
    let name: String

    var rawValue: String { id }

    init(id: String, name: String) {
        self.id = id
        self.name = name
    }

    init?(rawValue: String) {
        guard let found = (Language.allLanguages.first { lang in rawValue == lang.id }) else {
            return nil
        }
        self = found
    }
}

extension Language {
    static let allLanguages: [Language] = getAllLanguages()

    static private func getAllLanguages() -> [Language] {
        let currentLocale = Locale.current

        return Locale.LanguageCode.isoLanguageCodes.compactMap { code in
            if let name = currentLocale.localizedString(forLanguageCode: code.identifier) {
                return Language(id: code.identifier, name: name.capitalized)
            } else {
                return nil
            }
        }
        .sorted { $0.name < $1.name }
    }
}
