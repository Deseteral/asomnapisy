import SwiftUI

struct FilePickerView: View {
    @Binding var selectedFile: URL?

    @State private var isPresented = false

    private var selectedFilePath: Binding<String> {
        Binding {
            if let url = selectedFile {
                return url.path
            } else {
                return ""
            }
        } set: { updatedFilePath in
            selectedFile = URL.init(string: updatedFilePath)
        }
    }


    var body: some View {
        HStack {
            TextField("Subtitle file path", text: selectedFilePath)
                .textFieldStyle(RoundedBorderTextFieldStyle())

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
                case .failure(let error):
                    // TODO: This should be presented to the user.
                    print("Error: \(error.localizedDescription)")
            }
        }
    }
}
