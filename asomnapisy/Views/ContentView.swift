import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            MovieTranslationView()
                .tabItem({ Text("Movie") })
                .tag(0)
            Text("TODO TV translation view")
                .font(.title)
                .tabItem({ Text("TV") })
                .tag(1)
        }
    }
}

#Preview {
    ContentView()
}
