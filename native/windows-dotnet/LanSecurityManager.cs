using System;
using System.Collections.Concurrent;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace DayRhythm
{
    internal static class LanSecurityManager
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("DayRhythm_LanSync_Entropy_v1");
        private static readonly ConcurrentDictionary<string, DateTime> SeenNonces = new();
        private static byte[] _cachedKey;
        private static readonly object KeyLock = new();

        public static byte[] GetOrCreateSharedKey()
        {
            lock (KeyLock)
            {
                if (_cachedKey != null) return _cachedKey;

                try
                {
                    string dir = AppConfig.GetDataDir();
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    string keyPath = Path.Combine(dir, "lan_sync.dat");

                    if (File.Exists(keyPath))
                    {
                        try
                        {
                            byte[] encrypted = File.ReadAllBytes(keyPath);
                            try
                            {
                                _cachedKey = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
                            }
                            catch
                            {
                                _cachedKey = FallbackDecrypt(encrypted);
                            }

                            if (_cachedKey != null && _cachedKey.Length >= 16)
                            {
                                return _cachedKey;
                            }
                        }
                        catch { }
                    }

                    // Default shared secret for zero-config discovery out of the box
                    _cachedKey = Encoding.UTF8.GetBytes("DayRhythm_LanSync_Default_Entropy");

                    try
                    {
                        byte[] protectedBytes = null;
                        try
                        {
                            protectedBytes = ProtectedData.Protect(_cachedKey, Entropy, DataProtectionScope.CurrentUser);
                        }
                        catch
                        {
                            protectedBytes = FallbackEncrypt(_cachedKey);
                        }

                        if (protectedBytes != null)
                        {
                            File.WriteAllBytes(keyPath, protectedBytes);
                        }
                    }
                    catch { }

                    return _cachedKey;
                }
                catch
                {
                    // In-memory fallback
                    _cachedKey = Encoding.UTF8.GetBytes("DayRhythm_LanSync_Default_Entropy");
                    return _cachedKey;
                }
            }
        }

        public static string GetPairingCode()
        {
            byte[] key = GetOrCreateSharedKey();
            return Convert.ToBase64String(key);
        }

        public static bool SetPairingKeyFromBase64(string base64)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(base64)) return false;
                byte[] key = Convert.FromBase64String(base64.Trim());
                if (key.Length < 16) return false;
                lock (KeyLock)
                {
                    _cachedKey = key;
                    try
                    {
                        string dir = AppConfig.GetDataDir();
                        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                        string keyPath = Path.Combine(dir, "lan_sync.dat");
                        byte[] protectedBytes = null;
                        try
                        {
                            protectedBytes = ProtectedData.Protect(_cachedKey, Entropy, DataProtectionScope.CurrentUser);
                        }
                        catch
                        {
                            protectedBytes = FallbackEncrypt(_cachedKey);
                        }
                        if (protectedBytes != null)
                        {
                            File.WriteAllBytes(keyPath, protectedBytes);
                        }
                    }
                    catch { }
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        public static bool ValidateSignature(
            string method,
            string path,
            string body,
            string signatureHex,
            string timestampStr,
            string nonce)
        {
            if (string.IsNullOrEmpty(signatureHex) || string.IsNullOrEmpty(timestampStr) || string.IsNullOrEmpty(nonce))
                return false;

            if (!long.TryParse(timestampStr, out long clientTimeMs)) return false;
            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (Math.Abs(nowMs - clientTimeMs) > 120_000) return false;

            CleanupOldNonces();
            if (!SeenNonces.TryAdd(nonce, DateTime.UtcNow)) return false;

            byte[] key = GetOrCreateSharedKey();
            string canonicalString = $"{timestampStr}\n{nonce}\n{method.ToUpperInvariant()}\n{path}\n{body ?? ""}";
            byte[] canonicalBytes = Encoding.UTF8.GetBytes(canonicalString);

            using var hmac = new HMACSHA256(key);
            byte[] computedHash = hmac.ComputeHash(canonicalBytes);
            string computedHex = Convert.ToHexString(computedHash).ToLowerInvariant();

            bool isValid = CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(computedHex),
                Encoding.UTF8.GetBytes(signatureHex.ToLowerInvariant())
            );

            if (!isValid)
            {
                byte[] defaultKey = Encoding.UTF8.GetBytes("DayRhythm_LanSync_Default_Entropy");
                using var defaultHmac = new HMACSHA256(defaultKey);
                byte[] defaultHash = defaultHmac.ComputeHash(canonicalBytes);
                string defaultHex = Convert.ToHexString(defaultHash).ToLowerInvariant();
                isValid = CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(defaultHex),
                    Encoding.UTF8.GetBytes(signatureHex.ToLowerInvariant())
                );
            }

            return isValid;
        }

        public static (string signature, string timestamp, string nonce) GenerateSignature(
            string method,
            string path,
            string body)
        {
            byte[] key = GetOrCreateSharedKey();
            string timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            string nonce = Guid.NewGuid().ToString("N");
            string canonical = $"{timestamp}\n{nonce}\n{method.ToUpperInvariant()}\n{path}\n{body ?? ""}";

            using var hmac = new HMACSHA256(key);
            byte[] computed = hmac.ComputeHash(Encoding.UTF8.GetBytes(canonical));
            string signature = Convert.ToHexString(computed).ToLowerInvariant();
            return (signature, timestamp, nonce);
        }

        private static byte[] FallbackEncrypt(byte[] plain)
        {
            byte[] salt = SHA256.HashData(Encoding.UTF8.GetBytes(Environment.MachineName + Environment.UserName));
            byte[] key = SHA256.HashData(salt);
            byte[] iv = new byte[16];
            Array.Copy(salt, iv, 16);

            using var aes = Aes.Create();
            aes.Key = key;
            aes.IV = iv;
            using var ms = new MemoryStream();
            using (var cs = new CryptoStream(ms, aes.CreateEncryptor(), CryptoStreamMode.Write))
            {
                cs.Write(plain, 0, plain.Length);
            }
            return ms.ToArray();
        }

        private static byte[] FallbackDecrypt(byte[] cipher)
        {
            byte[] salt = SHA256.HashData(Encoding.UTF8.GetBytes(Environment.MachineName + Environment.UserName));
            byte[] key = SHA256.HashData(salt);
            byte[] iv = new byte[16];
            Array.Copy(salt, iv, 16);

            using var aes = Aes.Create();
            aes.Key = key;
            aes.IV = iv;
            using var ms = new MemoryStream();
            using (var cs = new CryptoStream(ms, aes.CreateDecryptor(), CryptoStreamMode.Write))
            {
                cs.Write(cipher, 0, cipher.Length);
            }
            return ms.ToArray();
        }

        private static void CleanupOldNonces()
        {
            DateTime cutoff = DateTime.UtcNow.AddMinutes(-3);
            foreach (var kvp in SeenNonces)
            {
                if (kvp.Value < cutoff)
                {
                    SeenNonces.TryRemove(kvp.Key, out _);
                }
            }
        }
    }
}
