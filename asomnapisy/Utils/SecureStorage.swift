import SwiftUI
import Security

@propertyWrapper
struct SecureStorage: DynamicProperty {
    let key: String
    @State private var value: String = ""

    var wrappedValue: String {
        get { value }
        nonmutating set {
            value = newValue
            save(newValue)
        }
    }

    var projectedValue: Binding<String> {
        Binding(
            get: { value },
            set: {
                value = $0
                save($0)
            }
        )
    }

    init(wrappedValue: String = "", _ key: String) {
        self.key = key
        // Initial fetch from Keychain.
        let initialValue = SecureStorage.read(key) ?? wrappedValue
        _value = State(initialValue: initialValue)
    }

    private func save(_ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]

        let attributes: [String: Any] = [
            kSecValueData as String: data
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            if addStatus != errSecSuccess {
                // TODO: Present error to the user
                print("SecureStorage: failed to add \(key), status: \(addStatus)")
            }
        } else if status != errSecSuccess {
            // TODO: Present error to the user
            print("SecureStorage: failed to update \(key), status: \(status)")
        }
    }

    static func read(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &result)
        if let data = result as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }
}
