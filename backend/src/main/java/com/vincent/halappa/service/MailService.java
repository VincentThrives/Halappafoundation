package com.vincent.halappa.service;

import com.vincent.halappa.domain.Enquiry;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/** Sends email over SMTP (bulk sends, inbox replies, enquiry notifications). No-op until SMTP is configured. */
@Slf4j
@Service
public class MailService {

    private final JavaMailSender sender;
    private final String host;
    private final String from;
    private final String notifyTo;
    private final InboxService inbox;

    // ObjectProvider: the mail sender bean only exists once spring.mail.host is configured.
    public MailService(ObjectProvider<JavaMailSender> senderProvider,
                       @Value("${spring.mail.host:}") String host,
                       @Value("${spring.mail.username:}") String username,
                       @Value("${app.mail.from:}") String from,
                       @Value("${app.mail.notify-to:}") String notifyTo,
                       @Lazy InboxService inbox) {
        this.sender = senderProvider.getIfAvailable();
        this.host = host;
        this.from = from.isBlank() ? username : from;
        this.notifyTo = notifyTo;
        this.inbox = inbox;
    }

    public boolean enabled() { return sender != null && host != null && !host.isBlank(); }

    /** Sends a plain-text UTF-8 email and returns its Message-ID. */
    public String send(String to, String subject, String text, String replyTo) {
        try {
            MimeMessage mm = sender.createMimeMessage();
            MimeMessageHelper h = new MimeMessageHelper(mm, false, "UTF-8");
            h.setFrom(from);
            h.setTo(to);
            if (replyTo != null && !replyTo.isBlank()) h.setReplyTo(replyTo);
            h.setSubject(subject);
            h.setText(text, false);
            sender.send(mm);
            return mm.getMessageID();
        } catch (Exception e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    @Async
    public void enquiryReceived(Enquiry e) {
        if (!enabled()) {
            log.info("SMTP not configured; enquiry #{} stored without email.", e.getId());
            return;
        }
        try {
            send(notifyTo, "[Halappa Foundation] New " + nz(e.getType()) + " #" + e.getId() + " from " + e.getName(), """
                    Name:     %s
                    Phone:    %s
                    Email:    %s
                    District: %s
                    Taluk:    %s
                    Type:     %s
                    Subject:  %s
                    Via:      %s

                    %s
                    """.formatted(e.getName(), nz(e.getPhone()), nz(e.getEmail()), nz(e.getDistrict()), nz(e.getTaluk()),
                    nz(e.getType()), nz(e.getSubject()), e.getChannel(), e.getMessage()), e.getEmail());

            if (e.getEmail() != null && !e.getEmail().isBlank()) {
                String subject = "We received your message (Ref #" + e.getId() + ") | Halappa Foundation";
                String body = """
                        Dear %s,

                        Thank you for writing to the Halappa Foundation. Your %s has been registered with reference number #%d.
                        Our team will get back to you shortly.

                        ನಿಮ್ಮ ಸಂದೇಶ ನಮಗೆ ತಲುಪಿದೆ. ಉಲ್ಲೇಖ ಸಂಖ್ಯೆ #%d. ನಮ್ಮ ತಂಡ ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.

                        Regards,
                        Halappa Foundation
                        """.formatted(e.getName(), nz(e.getType()).isEmpty() ? "message" : e.getType(), e.getId(), e.getId());
                String id = send(e.getEmail(), subject, body, null);
                inbox.recordOut("email", e.getEmail(), e.getName(), subject, body, "sent", id);
            }
        } catch (Exception ex) {
            log.warn("Could not email enquiry #{}: {}", e.getId(), ex.getMessage());
        }
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
