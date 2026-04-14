import UniformTypeIdentifiers

extension UTType {
    static var srt: UTType {
        UTType(filenameExtension: "srt") ?? .plainText
    }
}
