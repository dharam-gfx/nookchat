import CryptoJS from 'crypto-js';

/**
 * Generate a secure encryption key
 * Uses 256-bit key size for AES encryption
 */
const generateSecureKey = (): string => {
    return CryptoJS.lib.WordArray.random( 256 / 8 ).toString();
};

/**
 * Get encryption key from session storage, or generate a new one.
 * Keys are per-session and never shared between users — this is NOT true
 * end-to-end encryption (no key exchange protocol). Both parties must
 * independently share the same key out-of-band for messages to be decrypted.
 * ponytail: per-session symmetric AES, not E2E. Replace with X25519 + AEAD
 * if actual E2E is required.
 */
const getEncryptionKey = () => {
    if ( typeof window !== 'undefined' ) {
        const existing = sessionStorage.getItem( 'chatEncryptionKey' );
        if ( existing ) return existing;
    }

    const newKey = generateSecureKey();

    if ( typeof window !== 'undefined' ) {
        sessionStorage.setItem( 'chatEncryptionKey', newKey );
    }

    return newKey;
};

// Pre-warm a key on load so it's ready before first encrypt call
if ( typeof window !== 'undefined' && !sessionStorage.getItem( 'chatEncryptionKey' ) ) {
    sessionStorage.setItem( 'chatEncryptionKey', getEncryptionKey() );
}

/**
 * Encrypts a message using AES-256 encryption
 * @param message - The plaintext message to encrypt
 * @returns The encrypted message as a base64 string
 */
export const encryptMessage = ( message: string ): string => {
    try {
        console.log( '🔒 Starting message encryption...' );
        const key = getEncryptionKey();
        const encrypted = CryptoJS.AES.encrypt( message, key ).toString();
        console.log( '✅ Message encrypted successfully' );
        return encrypted;
    } catch ( error ) {
        console.error( '❌ Encryption failed — message not sent:', error );
        return ''; // ponytail: was `return message` — that leaked plaintext on wire
    }
};

/**
 * Decrypts an encrypted message
 * @param encryptedMessage - The encrypted message to decrypt
 * @returns The decrypted plaintext message
 */
export const decryptMessage = ( encryptedMessage: string ): string => {
    try {
        console.log( '🔓 Starting message decryption...' );
        const key = getEncryptionKey();
        const bytes = CryptoJS.AES.decrypt( encryptedMessage, key );
        const decrypted = bytes.toString( CryptoJS.enc.Utf8 );

        if ( !decrypted ) {
            console.warn( '⚠️ Decryption produced empty result' );
            return '';
        }

        console.log( '✅ Message decrypted successfully' );
        return decrypted;
    } catch ( error ) {
        console.error( '❌ Decryption failed:', error );
        return ''; // ponytail: was `return encryptedMessage` — showed garbage in UI
    }
};
