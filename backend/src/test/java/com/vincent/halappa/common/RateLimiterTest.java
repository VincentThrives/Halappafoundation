package com.vincent.halappa.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimiterTest {

    @Test
    void allowsUpToMaxThenBlocks() {
        RateLimiter l = new RateLimiter(3, 60_000);
        assertThat(l.allow("ip")).isTrue();
        assertThat(l.allow("ip")).isTrue();
        assertThat(l.allow("ip")).isTrue();
        assertThat(l.allow("ip")).isFalse();
    }

    @Test
    void keysAreIndependent() {
        RateLimiter l = new RateLimiter(1, 60_000);
        assertThat(l.allow("a")).isTrue();
        assertThat(l.allow("b")).isTrue();
        assertThat(l.allow("a")).isFalse();
    }

    @Test
    void windowExpires() throws InterruptedException {
        RateLimiter l = new RateLimiter(1, 50);
        assertThat(l.allow("ip")).isTrue();
        assertThat(l.allow("ip")).isFalse();
        Thread.sleep(80);
        assertThat(l.allow("ip")).isTrue();
    }
}
