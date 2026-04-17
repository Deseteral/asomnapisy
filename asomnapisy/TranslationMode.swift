enum TranslationMode: Identifiable, CaseIterable {
    case lineByLine
    case chunked

    var id: Self { self }

    var displayName: String {
        get {
            switch self {
                case .lineByLine:
                    return "Line by line"
                case .chunked:
                    return "Chunked"
            }
        }
    }
}
