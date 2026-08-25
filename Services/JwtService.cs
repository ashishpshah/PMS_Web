using System;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Cryptography.KeyDerivation;

namespace TaskManagement.Services
{
    public static class PasswordHasher
    {
        private const int Iterations = 100000;
        private const int HashSize   = 32;
        private const int SaltSize   = 16;

        public static string HashPassword(string password)
        {
            var salt = new byte[SaltSize];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(salt);
            var hash = KeyDerivation.Pbkdf2(password, salt, KeyDerivationPrf.HMACSHA256, Iterations, HashSize);
            return $"{Iterations}:{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
        }

        public static bool VerifyPassword(string password, string hashedPassword)
        {
            var parts = hashedPassword.Split(':');
            if (parts.Length != 3) return false;
            if (!int.TryParse(parts[0], out var iterations)) return false;
            var salt        = Convert.FromBase64String(parts[1]);
            var storedHash  = Convert.FromBase64String(parts[2]);
            var computedHash = KeyDerivation.Pbkdf2(password, salt, KeyDerivationPrf.HMACSHA256, iterations, HashSize);
            return CryptographicOperations.FixedTimeEquals(storedHash, computedHash);
        }
    }
}
