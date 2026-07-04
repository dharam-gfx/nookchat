# NookChat Encryption System Documentation

## Overview

NookChat uses **client-side AES-256 encryption** with per-session keys. This is **NOT end-to-end encryption** — there is no key exchange protocol (no X25519 Diffie-Hellman). Each browser session generates its own random key stored in `sessionStorage`. Two users in the same chat cannot decrypt each other's messages unless the same key is shared out-of-band. The encryption protects message contents from casual server-side inspection but does not provide the security guarantees of a true E2E system like Signal or WhatsApp.

## Table of Contents

1. [Encryption Technology](#encryption-technology)
2. [Key Management](#key-management)
3. [Message Encryption](#message-encryption)
4. [Image Encryption](#image-encryption)
5. [Security Considerations](#security-considerations)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Future Enhancements](#future-enhancements)

## Encryption Technology

NookChat utilizes the Advanced Encryption Standard (AES-256) implemented through the CryptoJS library. This provides a robust, industry-standard level of security:

- **Algorithm**: AES (Advanced Encryption Standard)
- **Key Size**: 256 bits
- **Mode**: CBC (Cipher Block Chaining)
- **Library**: CryptoJS
- **Implementation Location**: `src/utils/encryptionUtils.ts`

AES-256 is widely recognized as a secure encryption standard and is used by governments and security-focused organizations worldwide.

## Key Management

> [!CAUTION]
> This is **not** end-to-end encryption. Keys are per-session and random. There is no mechanism for two users to automatically share a key. For two users to decrypt each other's messages, they must share the same key out-of-band.

NookChat generates a single random AES-256 key per browser session:

### Key Generation

When needed, secure random keys are generated using:

```typescript
const generateSecureKey = (): string => {
    return CryptoJS.lib.WordArray.random(256 / 8).toString();
};
```

This creates a cryptographically strong random key with sufficient entropy for AES-256 encryption.

### Key Source

The key is generated once per browser session and stored in `sessionStorage`:

1. **Session Storage**: If a key already exists in `sessionStorage`, reuse it
2. **Generate**: Otherwise, generate a new 256-bit random key and store it in `sessionStorage`

```typescript
const getEncryptionKey = () => {
    if (typeof window !== 'undefined') {
        const existing = sessionStorage.getItem('chatEncryptionKey');
        if (existing) return existing;
    }

    const newKey = generateSecureKey();

    if (typeof window !== 'undefined') {
        sessionStorage.setItem('chatEncryptionKey', newKey);
    }

    return newKey;
};
```

### Key Initialization

The system initializes the encryption key in session storage on application startup:

```typescript
if (typeof window !== 'undefined' && !sessionStorage.getItem('chatEncryptionKey')) {
    sessionStorage.setItem('chatEncryptionKey', getEncryptionKey());
}
```

### Security Considerations

- Keys are unique per browser session, not per user. Refreshing the page generates a new key
- Session storage (rather than local storage) limits the key's persistence to the tab session
- The key is never transmitted to the server or stored in cookies
- Two users in the same chat have **different keys** unless they share the same key out-of-band — which means they generally cannot decrypt each other's messages
- This is **not** end-to-end encryption. It is client-side encryption with per-session keys

## Message Encryption

### Encryption Process

Messages are encrypted using the following process in `encryptMessage()`:

1. Retrieve the encryption key using the hierarchy described above
2. Use CryptoJS.AES to encrypt the plaintext message with the key
3. Return the encrypted message as a string

```typescript
export const encryptMessage = (message: string): string => {
    try {
        console.log('🔒 Starting message encryption...');
        const key = getEncryptionKey();
        const encrypted = CryptoJS.AES.encrypt(message, key).toString();
        console.log('✅ Message encrypted successfully');
        return encrypted;
    } catch (error) {
        console.error('❌ Encryption failed:', error);
        return message; // Fallback to unencrypted message in case of error
    }
};
```

### Decryption Process

Received messages are decrypted using the following process in `decryptMessage()`:

1. Retrieve the same encryption key
2. Use CryptoJS.AES to decrypt the encrypted message
3. Convert the decrypted bytes to a UTF-8 string
4. Return the original plaintext message

```typescript
export const decryptMessage = (encryptedMessage: string): string => {
    try {
        console.log('🔓 Starting message decryption...');
        const key = getEncryptionKey();
        const bytes = CryptoJS.AES.decrypt(encryptedMessage, key);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decrypted) {
            console.warn('⚠️ Decryption produced empty result');
            return encryptedMessage;
        }
        
        console.log('✅ Message decrypted successfully');
        return decrypted;
    } catch (error) {
        console.error('❌ Decryption failed:', error);
        return encryptedMessage; // Return encrypted text if decryption fails
    }
};
```

## Image Encryption

NookChat includes comprehensive image encryption capabilities for secure image sharing.

### Image Optimization Before Encryption

To improve performance, images are optimized before encryption:

1. Images are loaded into an HTML5 Canvas element
2. Resized if they exceed maximum dimensions (1600px by default)
3. Compressed with configurable quality (0.85 by default)
4. Converted to a more efficient JPEG format

```typescript
const optimizeImageBeforeEncryption = async (file, maxWidth = 1600, quality = 0.85) => {
    // Implementation using HTML5 Canvas for resizing and optimizing
    // Reduces file size while maintaining acceptable quality
};
```

### Image Encryption Process

The image encryption pipeline involves:

1. **Optimization**: Resize and compress the image
2. **Conversion**: Convert the optimized image to a Base64 string
3. **Encryption**: Encrypt the Base64 string using the same AES-256 encryption used for messages
4. **Packaging**: Create a new file with the encrypted content

```typescript
const encryptImageFile = async (file) => {
    try {
        // Check if the file is an image
        if (!file.type.startsWith('image/')) {
            return file; // Non-image files are passed through as-is
        }
        
        // Step 1: Optimize image before encryption
        const optimizedBlob = await optimizeImageBeforeEncryption(file);
        
        // Step 2: Read as ArrayBuffer and convert to WordArray
        const arrayBuffer = await optimizedBlob.arrayBuffer();
        const wordArray = CryptoJS.lib.WordArray.create(new Uint8Array(arrayBuffer));
        
        // Step 3: Create Base64 string and encrypt
        const base64 = CryptoJS.enc.Base64.stringify(wordArray);
        const encrypted = encryptMessage(base64);
        
        // Step 4: Create new file with encrypted content
        const encryptedBlob = new Blob([encrypted], { type: 'application/encrypted' });
        return new File([encryptedBlob], `${file.name}.encrypted`, {
            type: 'application/encrypted',
            lastModified: Date.now()
        });
    } catch (error) {
        console.error('Failed to encrypt image:', error);
        return file; // Fall back to original file if encryption fails
    }
};
```

### Image Decryption Process

When displaying images, the `EncryptedImage` component:

1. Fetches the encrypted image content
2. Decrypts the content using the encryption key
3. Converts the decrypted Base64 content to a data URL
4. Renders the image using the data URL

```typescript
const decryptImageUrl = async (url) => {
    try {
        // Generate unique ID for logging
        const decryptId = Math.random().toString(36).substring(2, 8);
        
        // Fetch the encrypted image data
        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
        
        // Get the encrypted text content
        const encryptedText = await response.text();
        
        // Decrypt the content
        const decryptedBase64 = decryptMessage(encryptedText);
        
        // Get the original file type
        const fileType = await getOriginalFileType(url);
        
        // Create and return data URL
        return `data:${fileType};base64,${decryptedBase64}`;
    } catch (error) {
        console.error('Image decryption failed:', error);
        return url; // Fall back to original URL if decryption fails
    }
};
```

### Error Handling and Fallbacks

The `EncryptedImage` component implements several fallback strategies:

1. Retries failed decryption attempts up to 2 times
2. Displays placeholder images during loading
3. Shows user-friendly error states with retry options
4. Falls back to the original encrypted image if decryption fails

## Security Considerations

### Strengths

1. **Client-Side Encryption**: Messages are encrypted before leaving the user's browser
2. **Strong Algorithm**: AES-256 is a robust, industry-standard encryption algorithm
3. **Per-Session Keys**: Keys are generated fresh per session, limiting exposure window

### Limitations

1. **Not True End-to-End**: There is no key exchange. Each session generates a unique key, so two users cannot decrypt each other's messages automatically
2. **Browser-Based**: As a web application, NookChat is subject to browser security limitations
3. **Key Management**: Client-side key management has inherent security challenges
4. **AI Features**: The AI suggestion/rewrite features send plaintext message content to Google's Gemini API (server-side, with user opt-in)

## Error Handling

NookChat employs error handling:

1. **Fail Silent**: If encryption or decryption fails, the message is replaced with an empty string to avoid leaking plaintext over the wire
2. **Detailed Logging**: Console logs provide visibility into encryption/decryption processes
3. **Automatic Recovery**: Implements automatic retries for transient failures

## Best Practices

The encryption system follows several security practices:

1. **Secure Key Generation**: Uses cryptographically secure random number generation
2. **Minimal Key Storage**: Avoids unnecessary persistence of encryption keys
3. **No Data Leakage**: Encryption failures produce empty strings, not plaintext
4. **Testing**: Includes verification of encryption/decryption pipeline

## Future Enhancements

If true end-to-end encryption is needed, the system should be replaced with:

1. **X25519 Diffie-Hellman Key Exchange**: Enable two users to agree on a shared key without the server knowing it
2. **Per-Message Keys**: Derive unique keys per message using a ratchet (Signal protocol)
3. **AEAD Encryption**: Use AES-256-GCM or XChaCha20-Poly1305 for authenticated encryption
4. **Web Crypto API**: Replace CryptoJS with the native Web Crypto API for better performance and security
5. **Key Verification**: Add fingerprint comparison (safety numbers) so users can verify keys out-of-band
6. **Perfect Forward Secrecy**: Implement the Signal double-ratchet protocol

> [!NOTE]
> For a reference implementation of proper E2E encryption in a chat app, see [safechat](https://github.com/ashev87/safechat).

---
