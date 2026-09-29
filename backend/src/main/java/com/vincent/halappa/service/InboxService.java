package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.Message;
import com.vincent.halappa.domain.MessageRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Records every message in/out and serves the admin Inbox (conversations, message log, replies). */
@Service
public class InboxService {

    private static final List<String> OUT_ORDER = List.of("queued", "manual", "sent", "delivered", "read");

    private final MessageRepository messages;
    private final WhatsAppService whatsapp;
    private final MailService mail;

    public InboxService(MessageRepository messages, WhatsAppService whatsapp, @Lazy MailService mail) {
        this.messages = messages;
        this.whatsapp = whatsapp;
        this.mail = mail;
    }

    // ---------- Recording ----------

    /** Stores a message someone sent to the foundation. Duplicate provider ids (webhook retries) are ignored. */
    public Message recordIn(String channel, String contact, String name, String subject, String body, String providerId) {
        if (providerId != null && messages.existsByProviderIdAndDirection(providerId, "in")) return null;
        Message m = new Message();
        m.setChannel(channel);
        m.setDirection("in");
        m.setContact(contact);
        m.setName(cap(name, 150));
        m.setSubject(cap(subject, 300));
        m.setBody(cap(body, 4000));
        m.setStatus("received");
        m.setProviderId(cap(providerId, 250));
        m.setAdminRead(false);
        return messages.save(m);
    }

    public Message recordOut(String channel, String contact, String name, String subject, String body, String status, String providerId) {
        Message m = new Message();
        m.setChannel(channel);
        m.setDirection("out");
        m.setContact(contact);
        m.setName(cap(name, 150));
        m.setSubject(cap(subject, 300));
        m.setBody(cap(body, 4000));
        m.setStatus(status);
        m.setProviderId(cap(providerId, 250));
        m.setUpdatedAt(LocalDateTime.now());
        return messages.save(m);
    }

    /** Delivery receipts: statuses only move forward (sent → delivered → read); failed wins unless already read. */
    public void updateStatus(String providerId, String status, String error) {
        messages.findFirstByProviderIdAndDirection(providerId, "out").ifPresent(m -> {
            boolean forward = OUT_ORDER.indexOf(status) > OUT_ORDER.indexOf(m.getStatus());
            boolean fail = "failed".equals(status) && !"read".equals(m.getStatus());
            if (forward || fail) {
                m.setStatus(status);
                if (error != null) m.setError(cap(error, 1000));
                m.setUpdatedAt(LocalDateTime.now());
                messages.save(m);
            }
        });
    }

    // ---------- Reading ----------

    public record Thread(String channel, String contact, String name, String lastBody, String lastDirection,
                         LocalDateTime lastAt, long unread, long received) {}

    public PageDto<Thread> threads(String channel, String q, boolean includeSentOnly, int page, int size) {
        String like = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase() + "%";
        var p = messages.threads(blank(channel), like, includeSentOnly, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        List<Long> lastIds = p.getContent().stream().map(r -> ((Number) r[2]).longValue()).toList();
        Map<Long, Message> last = messages.findAllById(lastIds).stream().collect(Collectors.toMap(Message::getId, Function.identity()));
        List<Thread> items = p.getContent().stream().map(r -> {
            Message m = last.get(((Number) r[2]).longValue());
            String name = m.getName();
            if (name == null) name = messages.findByChannelAndContactOrderByIdAsc(m.getChannel(), m.getContact()).stream()
                    .map(Message::getName).filter(Objects::nonNull).reduce((a, b) -> b).orElse(null);
            return new Thread((String) r[0], (String) r[1], name, snippet(m.getBody()), m.getDirection(), m.getCreatedAt(),
                    ((Number) r[3]).longValue(), ((Number) r[4]).longValue());
        }).toList();
        return new PageDto<>(items, p.getTotalElements(), p.getNumber(), p.getSize());
    }

    /** Full conversation, oldest first; opening it marks incoming messages as read. */
    public List<Message> thread(String channel, String contact) {
        messages.markThreadRead(channel, contact);
        return messages.findByChannelAndContactOrderByIdAsc(channel, contact);
    }

    public long unread() { return messages.countByDirectionAndAdminReadFalse("in"); }

    /** Flat message log with filters. */
    public PageDto<Message> log(String channel, String direction, String status, String q, LocalDate from, LocalDate to, int page, int size) {
        Specification<Message> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (!isBlank(channel)) ps.add(cb.equal(root.get("channel"), channel));
            if (!isBlank(direction)) ps.add(cb.equal(root.get("direction"), direction));
            if (!isBlank(status)) ps.add(cb.equal(root.get("status"), status));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay()));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay()));
            if (!isBlank(q)) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(cb.like(cb.lower(root.get("contact")), like), cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("body")), like), cb.like(cb.lower(root.get("voucher")), like),
                        cb.like(cb.lower(root.get("subject")), like)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        return PageDto.of(messages.findAll(spec, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by(Sort.Direction.DESC, "id"))));
    }

    // ---------- Replying ----------

    public record ReplyResult(Message message, String link) {}

    public ReplyResult reply(String channel, String contact, String subject, String text) {
        if (isBlank(text)) throw ApiException.badRequest("Write a reply first");
        String name = messages.findByChannelAndContactOrderByIdAsc(channel, contact).stream()
                .map(Message::getName).filter(Objects::nonNull).reduce((a, b) -> b).orElse(null);
        switch (channel) {
            case "whatsapp", "web" -> {
                String phone = Contacts.phone(contact);
                if (phone == null) throw ApiException.badRequest("No valid WhatsApp number for this conversation");
                if (whatsapp.apiEnabled()) {
                    try {
                        String id = whatsapp.send(phone, text, null, null, null);
                        return new ReplyResult(recordOut("whatsapp", phone, name, null, text, "sent", id), null);
                    } catch (Exception e) {
                        Message m = recordOut("whatsapp", phone, name, null, text, "failed", null);
                        m.setError(cap(e.getMessage(), 1000));
                        messages.save(m);
                        throw ApiException.badRequest("WhatsApp refused the reply (outside the 24-hour window needs a template): " + cap(e.getMessage(), 200));
                    }
                }
                Message m = recordOut("whatsapp", phone, name, null, text, "manual", null);
                return new ReplyResult(m, WhatsAppService.link(phone, text));
            }
            case "email" -> {
                if (!mail.enabled()) throw ApiException.badRequest("Email is not connected (set SMTP details on the server)");
                String subj = isBlank(subject) ? "Halappa Foundation" : subject;
                String id = mail.send(contact, subj, text, null);
                return new ReplyResult(recordOut("email", contact, name, subj, text, "sent", id), null);
            }
            case "sms" -> throw ApiException.badRequest("SMS replies need a DLT-approved template; send them as a bulk SMS campaign instead.");
            default -> throw ApiException.badRequest("Unknown channel");
        }
    }

    // ---------- helpers ----------

    private static String snippet(String s) { return s == null ? "" : s.length() > 120 ? s.substring(0, 120) + "…" : s; }
    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
    private static String blank(String s) { return isBlank(s) ? null : s; }
    static String cap(String s, int max) { return s == null ? null : s.length() > max ? s.substring(0, max) : s; }
}
