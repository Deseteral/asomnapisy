import SwiftUI

struct MovieTranslationView: View {

    var body: some View {
        VStack {
            FilePickerView()
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

#Preview {
    MovieTranslationView()
}
