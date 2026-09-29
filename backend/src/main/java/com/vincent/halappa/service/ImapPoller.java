package com.vincent.halappa.service;

import jakarta.mail.*;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.search.FlagTerm;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Properties;

/** Reads new mail from the foundation's mailbox (IMAP) into the admin Inbox every couple of minutes. */
@Slf4j
@Component
public class ImapPoller {

    private final InboxService inbox;
    private final String host, user, pass, folder, sslTrust;
    private final int port;

    public ImapPoller(InboxService inbox,
                      @Value("${mail.imap.host:}") String host,
                      @Value("${mail.imap.port:993}") int port,
                      @Value("${mail.imap.username:${spring.mail.username:}}") String user,
                      @Value("${mail.imap.password:${spring.mail.password:}}") String pass,
                      @Value("${mail.imap.folder:INBOX}") String folder,
                      /** Only for mail servers with a self-signed certificate, e.g. "mail.example.org" or "*". */
                      @Value("${mail.imap.ssl-trust:}") String sslTrust) {
        this.inbox = inbox;
        this.host = host;
        this.port = port;
        this.user = user;
        this.pass = pass;
        this.folder = folder;
        this.sslTrust = sslTrust;
    }

    public boolean enabled() { return !host.isBlank() && !user.isBlank(); }

    @Scheduled(initialDelayString = "${mail.imap.initial-delay-ms:30000}", fixedDelayString = "${mail.imap.poll-ms:120000}")
    public void poll() {
        if (!enabled()) return;
        Properties p = new Properties();
        p.put("mail.store.protocol", "imaps");
        p.put("mail.imaps.connectiontimeout", "15000");
        p.put("mail.imaps.timeout", "30000");
        if (!sslTrust.isBlank()) {
            // Explicitly trusted self-signed server: its certificate won't carry the host name either.
            p.put("mail.imaps.ssl.trust", sslTrust);
            p.put("mail.imaps.ssl.checkserveridentity", "false");
        }
        try {
            Store store = Session.getInstance(p).getStore("imaps");
            store.connect(host, port, user, pass);
            Folder f = store.getFolder(folder);
            f.open(Folder.READ_WRITE);
            jakarta.mail.Message[] unseen = f.search(new FlagTerm(new Flags(Flags.Flag.SEEN), false));
            int n = 0;
            for (jakarta.mail.Message m : unseen) {
                if (n++ >= 200) break;
                Address[] from = m.getFrom();
                if (from == null || from.length == 0) continue;
                InternetAddress a = (InternetAddress) from[0];
                String email = Contacts.email(a.getAddress());
                if (email == null) continue;
                String[] ids = m.getHeader("Message-ID");
                inbox.recordIn("email", email, a.getPersonal(), m.getSubject(), text(m),
                        ids != null && ids.length > 0 ? ids[0] : null);
                m.setFlag(Flags.Flag.SEEN, true);
            }
            f.close(false);
            store.close();
        } catch (Exception e) {
            log.warn("IMAP check failed: {}", e.getMessage());
        }
    }

    /** First text/plain part, else stripped HTML. */
    static String text(Part p) throws Exception {
        if (p.isMimeType("text/plain")) return String.valueOf(p.getContent()).trim();
        if (p.isMimeType("multipart/*")) {
            Multipart mp = (Multipart) p.getContent();
            String html = null;
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart bp = mp.getBodyPart(i);
                if (bp.isMimeType("text/plain")) return String.valueOf(bp.getContent()).trim();
                String t = text(bp);
                if (t != null && html == null) html = t;
            }
            return html;
        }
        if (p.isMimeType("text/html")) {
            return String.valueOf(p.getContent()).replaceAll("(?is)<(script|style).*?</\\1>", " ")
                    .replaceAll("<[^>]+>", " ").replaceAll("&nbsp;", " ").replaceAll("\\s{2,}", " ").trim();
        }
        return null;
    }
}
