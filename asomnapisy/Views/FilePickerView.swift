import SwiftUI

struct FilePickerView: View {
    @Binding var selectedFile: URL?

    @State private var selectedFilePath: String = ""
    @State private var isPresented = false

    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        HStack {
            TextField("Subtitle file path", text: $selectedFilePath)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .focused($isTextFieldFocused)
                .onChange(of: isTextFieldFocused) {
                    if isTextFieldFocused { return }
                    let newUrlValue = URL.init(string: selectedFilePath)
                    if newUrlValue?.path != selectedFile?.path {
                        selectedFile = newUrlValue
                    }
                }

            Button("Select File") {
                isPresented = true
            }
        }
        .fileImporter(
            isPresented: $isPresented,
            allowedContentTypes: [.srt],
            allowsMultipleSelection: false,
        ) { result in
            switch result {
                case .success(let url):
                    selectedFile = url.first
                    selectedFilePath = selectedFile?.path ?? ""
                case .failure(let error):
                    selectedFile = nil
                    selectedFilePath = ""
                    // TODO: This should be presented to the user.
                    print("Error: \(error.localizedDescription)")
            }
        }
    }
}
