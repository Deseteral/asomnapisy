import Foundation

struct Language: Identifiable, Hashable {
    let id: String
    let name: String
}

extension Language {
    static var allLanguages: [Language] {
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
