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

    public String issue(String username) {
        long now = System.currentTimeMillis();
        return Jwts.builder().subject(username).issuedAt(new Date(now)).expiration(new Date(now + ttlMs)).signWith(key).compact();
    }

    /** @return the username, or null if the token is invalid or expired */
    public String parse(String token) {
        try {
            return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload().getSubject();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
