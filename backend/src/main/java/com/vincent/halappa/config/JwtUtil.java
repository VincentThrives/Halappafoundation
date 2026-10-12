package com.vincent.halappa.config;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {
    private final SecretKey key;
    private final long ttlMs;

    public JwtUtil(@Value("${app.jwt.secret:}") String secret, @Value("${app.jwt.ttl-minutes:720}") long ttlMinutes) {
        byte[] bytes = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            // No (or too short) JWT_SECRET: use a random key so no guessable default ever signs tokens.
            org.slf4j.LoggerFactory.getLogger(JwtUtil.class)
                    .warn("JWT_SECRET is not set (or shorter than 32 characters); using a random key. Set it on the server so sign-ins survive restarts.");
            bytes = new byte[64];
            new java.security.SecureRandom().nextBytes(bytes);
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.ttlMs = ttlMinutes * 60_000;
    }

    /** Who is signed in and their role ("ADMIN" or "SUPER_ADMIN"). */
    public record Token(String username, String role) {}

    public String issue(String username) { return issue(username, "ADMIN"); }

    public String issue(String username, String role) {
        long now = System.currentTimeMillis();
        return Jwts.builder().subject(username).claim("role", role).issuedAt(new Date(now))
                .expiration(new Date(now + ttlMs)).signWith(key).compact();
    }

    /** @return the username, or null if the token is invalid or expired */
    public String parse(String token) {
        Token t = parseToken(token);
        return t == null ? null : t.username();
    }

    /** @return username and role, or null if the token is invalid or expired */
    public Token parseToken(String token) {
        try {
            var claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            String role = claims.get("role", String.class);
            return new Token(claims.getSubject(), "SUPER_ADMIN".equals(role) ? "SUPER_ADMIN" : "ADMIN");
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
