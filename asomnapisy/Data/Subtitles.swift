import Foundation

struct SrtSubtitle {
    let order: String
    let timestamp: String
    let content: [String]

    func getFullText() -> String {
        return content.joined(separator: "\n")
    }
}

struct SrtData {
    let subtitles: [SrtSubtitle]

    init(subtitles: [SrtSubtitle]) {
        self.subtitles = subtitles
    }

    func getFullText() -> String {
        return subtitles.map { $0.getFullText() }.joined(separator: "\n")
    }
}

// SRT file parsing and serialization.
extension SrtData {
    init?(contentsOf file: URL) {
        guard let text = try? String(contentsOf: file, encoding: .utf8) else {
            return nil
        }

        let groups = text.components(separatedBy: "\n\n")

        self.subtitles = groups.compactMap { group in
            let lines = group.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            guard lines.count >= 3 else {
                return nil
            }

            let order = lines[0]
            let timestamp = lines[1]
            let content = Array(lines[2...])

            return SrtSubtitle(order: order, timestamp: timestamp, content: content)
        }
    }

    func serialize(to file: URL) throws {
        let text = subtitles.map { subtitle in
            ([subtitle.order, subtitle.timestamp] + subtitle.content + ["", ""]).joined(separator: "\n")
        }.joined()

        try text.write(to: file, atomically: true, encoding: .utf8)
    }
}
