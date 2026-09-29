package com.vincent.halappa.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class WhatsAppServiceTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "9876543210, 919876543210",
            "09876543210, 919876543210",
            "+91 98765 43210, 919876543210",
            "91-9876543210, 919876543210",
            "(987) 654-3210, 919876543210",
            "+14155552671, 14155552671",
    })
    void normalizesIndianAndInternationalNumbers(String in, String out) {
        assertThat(WhatsAppService.normalize(in)).isEqualTo(out);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "12", "abcdefghij", "98765", "1234567890123456"})
    void rejectsInvalidNumbers(String in) {
        assertThat(WhatsAppService.normalize(in)).isNull();
    }

    @Test
    void rejectsNull() {
        assertThat(WhatsAppService.normalize(null)).isNull();
    }

    @Test
    void linkEncodesTextWithPercentTwentySpaces() {
        String link = WhatsAppService.link("919876543210", "Namaskara Ramesh & family\nಧನ್ಯವಾದ");
        assertThat(link).startsWith("https://wa.me/919876543210?text=Namaskara%20Ramesh%20%26%20family%0A");
        assertThat(link).doesNotContain("+").doesNotContain(" ");
    }

    @Test
    void apiDisabledWithoutCredentials() {
        String base = "https://graph.facebook.com";
        assertThat(new WhatsAppService("", "", "v21.0", base).apiEnabled()).isFalse();
        assertThat(new WhatsAppService("token", "", "v21.0", base).apiEnabled()).isFalse();
        assertThat(new WhatsAppService("token", "123", "v21.0", base).apiEnabled()).isTrue();
    }
}
