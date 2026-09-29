package com.vincent.halappa.service;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.GreenMailUtil;
import com.icegreen.greenmail.util.ServerSetupTest;
import jakarta.mail.Flags;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Reads a real (in-process) IMAPS mailbox, like the foundation's inbox in production. */
class ImapPollerTest {

    @RegisterExtension
    static GreenMailExtension mail = new GreenMailExtension(
            new com.icegreen.greenmail.util.ServerSetup[]{ServerSetupTest.SMTP, ServerSetupTest.IMAPS});

    InboxService inbox;
    ImapPoller poller;

    @BeforeEach
    void setUp() {
        mail.setUser("info@halappafoundation.org", "info", "secret");
        inbox = mock(InboxService.class);
        poller = new ImapPoller(inbox, "127.0.0.1", ServerSetupTest.IMAPS.getPort(), "info", "secret", "INBOX", "*");
    }

    private MimeMessage message(String from, String personal, String subject) throws Exception {
        MimeMessage m = new MimeMessage(mail.getSmtp().createSession());
        m.setFrom(new InternetAddress(from, personal, "UTF-8"));
        m.setRecipients(jakarta.mail.Message.RecipientType.TO, "info@halappafoundation.org");
        m.setSubject(subject, "UTF-8");
        return m;
    }

    @Test
    void newMailLandsInTheInboxOnceAndIsMarkedRead() throws Exception {
        MimeMessage m = message("Ramesh@Example.com", "Ramesh Kumar", "Kit distribution query");
        m.setText("ಕಿಟ್ ವಿತರಣೆ ಎಲ್ಲಿ? Where is the venue?", "UTF-8");
        GreenMailUtil.sendMimeMessage(m);

        poller.poll();
        verify(inbox).recordIn(eq("email"), eq("ramesh@example.com"), eq("Ramesh Kumar"), eq("Kit distribution query"),
                eq("ಕಿಟ್ ವಿತರಣೆ ಎಲ್ಲಿ? Where is the venue?"), startsWith("<"));

        // Second check finds nothing new (message flagged as seen on the server).
        poller.poll();
        verify(inbox, times(1)).recordIn(any(), any(), any(), any(), any(), any());
        assertThat(mail.getReceivedMessages()[0].getFlags().contains(Flags.Flag.SEEN)).isTrue();
    }

    @Test
    void multipartMailUsesThePlainTextPart() throws Exception {
        MimeMessage m = message("asha@example.com", null, "Re: invitation");
        MimeMultipart mp = new MimeMultipart("alternative");
        MimeBodyPart plain = new MimeBodyPart();
        plain.setText("I will attend.", "UTF-8");
        MimeBodyPart html = new MimeBodyPart();
        html.setContent("<p>I <b>will</b> attend.</p>", "text/html; charset=UTF-8");
        mp.addBodyPart(plain);
        mp.addBodyPart(html);
        m.setContent(mp);
        GreenMailUtil.sendMimeMessage(m);

        poller.poll();
        verify(inbox).recordIn(eq("email"), eq("asha@example.com"), isNull(), eq("Re: invitation"), eq("I will attend."), any());
    }

    @Test
    void htmlOnlyMailIsTurnedIntoText() throws Exception {
        MimeMessage m = message("b@example.com", "B", "Hello");
        m.setContent("<html><style>p{}</style><body><p>Coming&nbsp;with   family</p></body></html>", "text/html; charset=UTF-8");
        GreenMailUtil.sendMimeMessage(m);

        poller.poll();
        verify(inbox).recordIn(eq("email"), eq("b@example.com"), eq("B"), eq("Hello"), eq("Coming with family"), any());
    }

    @Test
    void wrongPasswordIsLoggedNotThrown() {
        new ImapPoller(inbox, "127.0.0.1", ServerSetupTest.IMAPS.getPort(), "info", "wrong", "INBOX", "*").poll();
        verifyNoInteractions(inbox);
    }

    @Test
    void doesNothingWhenNotConfigured() {
        ImapPoller off = new ImapPoller(inbox, "", 993, "", "", "INBOX", "");
        assertThat(off.enabled()).isFalse();
        off.poll();
        verifyNoInteractions(inbox);
    }
}
