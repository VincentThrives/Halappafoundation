package com.vincent.halappa.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ContactsTest {

    @Test
    void personaliseFillsNameAndVoucher() {
        assertThat(Contacts.personalise("Namaskara {name}, your voucher is {voucher}.", "Ramesh", "KIT-0007"))
                .isEqualTo("Namaskara Ramesh, your voucher is KIT-0007.");
    }

    @Test
    void personaliseBlankNameLeavesNoGap() {
        assertThat(Contacts.personalise("Namaskara {name}, welcome.", "", null)).isEqualTo("Namaskara, welcome.");
        assertThat(Contacts.personalise("Hi {name}", null, null)).isEqualTo("Hi");
        assertThat(Contacts.personalise("Hi {name} there", " ", null)).isEqualTo("Hi there");
    }

    @Test
    void personaliseKeepsLineBreaksAndKannada() {
        assertThat(Contacts.personalise("ನಮಸ್ಕಾರ {name}\nಚೀಟಿ: {voucher}", "ಸುರೇಶ್", "KIT-1"))
                .isEqualTo("ನಮಸ್ಕಾರ ಸುರೇಶ್\nಚೀಟಿ: KIT-1");
    }

    @Test
    void emails() {
        assertThat(Contacts.email("  Ramesh@Example.COM ")).isEqualTo("ramesh@example.com");
        assertThat(Contacts.email("no-at-sign")).isNull();
        assertThat(Contacts.email("a@b")).isNull();
        assertThat(Contacts.email(null)).isNull();
    }

    @Test
    void parsesNumbersWrittenWithSpaces() {
        assertThat(Contacts.parseNumbers("+91 99887 76655")).containsExactly("919988776655");
        assertThat(Contacts.parseNumbers("98450 12345")).containsExactly("919845012345");
    }

    @Test
    void parsesCommaSemicolonNewlineAndSpaceSeparatedLists() {
        assertThat(Contacts.parseNumbers("9123456789, 9988776655;9845012345\n9000000001\r\n9000000002"))
                .containsExactly("919123456789", "919988776655", "919845012345", "919000000001", "919000000002");
        assertThat(Contacts.parseNumbers("9123456789 9988776655")).containsExactly("919123456789", "919988776655");
    }

    @Test
    void skipsJunk() {
        assertThat(Contacts.parseNumbers("12, abc,  , 9123456789")).containsExactly("919123456789");
        assertThat(Contacts.parseNumbers("")).isEmpty();
        assertThat(Contacts.parseNumbers(null)).isEmpty();
    }
}
