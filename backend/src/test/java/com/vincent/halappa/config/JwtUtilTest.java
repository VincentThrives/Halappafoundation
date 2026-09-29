package com.vincent.halappa.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilTest {

    private static final String SECRET = "test-secret-that-is-definitely-long-enough-for-hmac-sha-512-signing-key-0123456789";

    @Test
    void issuedTokenParsesBackToUsername() {
        JwtUtil jwt = new JwtUtil(SECRET, 60);
        assertThat(jwt.parse(jwt.issue("admin"))).isEqualTo("admin");
    }

    @Test
    void tamperedTokenIsRejected() {
        JwtUtil jwt = new JwtUtil(SECRET, 60);
        String t = jwt.issue("admin");
        String tampered = t.substring(0, t.length() - 3) + (t.endsWith("AAA") ? "BBB" : "AAA");
        assertThat(jwt.parse(tampered)).isNull();
    }

    @Test
    void tokenFromOtherSecretIsRejected() {
        String t = new JwtUtil(SECRET, 60).issue("admin");
        assertThat(new JwtUtil(SECRET.replace('t', 'x'), 60).parse(t)).isNull();
    }

    @Test
    void expiredTokenIsRejected() {
        JwtUtil jwt = new JwtUtil(SECRET, -1);
        assertThat(jwt.parse(jwt.issue("admin"))).isNull();
    }

    @Test
    void garbageIsRejected() {
        JwtUtil jwt = new JwtUtil(SECRET, 60);
        assertThat(jwt.parse("not-a-token")).isNull();
        assertThat(jwt.parse("")).isNull();
    }
}
