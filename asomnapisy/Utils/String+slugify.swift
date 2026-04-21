extension String {
    var slugify: String {
        self.filter { $0.isASCII && $0.isNumber || $0.isLetter }
    }
}
