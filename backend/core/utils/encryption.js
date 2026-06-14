/**
 * Encryption utility for sensitive data (API keys, card PANs, etc.)
 * Uses AES-256-GCM for encryption
 * AFILIATORS Backend - CommonJS
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

/**
 * Get the encryption key from environment
 * Returns a Buffer of 32 bytes
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.warn('ENCRYPTION_KEY not set in .env. Using random key (data will be lost on restart)');
    console.warn('Generate a key: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
    return crypto.randomBytes(32);
  }
  // If hex string, convert to Buffer
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  // If raw string, hash to 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:authTag:encryptedData (all hex)
 */
function encrypt(text) {
  if (!text) return null;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error.message);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt a string
 * @param {string} encryptedText - Encrypted text in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;

  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }

    const [ivHex, authTagHex, encryptedData] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Generate a secure encryption key (for setup)
 * @returns {string} - Hex-encoded 32-byte key
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a string (one-way, for verification)
 * @param {string} text - Text to hash
 * @returns {string} - SHA256 hash
 */
function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  generateEncryptionKey,
  hash,
};
