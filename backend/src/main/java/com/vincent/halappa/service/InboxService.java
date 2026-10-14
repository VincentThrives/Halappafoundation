package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.MongoQueries;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.Message;
import com.vincent.halappa.domain.MessageRepository;
import com.vincent.halappa.domain.MessageRepositoryCustom.ThreadRow;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
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
    private final MongoTemplate mongo;
    @org.springframework.beans.factory.annotation.Autowired(required = false) private WalletService wallet;

    public InboxService(MessageRepository messages, WhatsAppService whatsapp, @Lazy MailService mail, MongoTemplate mongo) {
        this.messages = messages;
        this.whatsapp = whatsapp;
        this.mail = mail;
        this.mongo = mongo;
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
        var p = messages.threads(blank(channel), blank(q), includeSentOnly, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        List<Long> lastIds = p.getContent().stream().map(ThreadRow::lastId).toList();
        Map<Long, Message> last = messages.findAllById(lastIds).stream().collect(Collectors.toMap(Message::getId, Function.identity()));
        List<Thread> items = p.getContent().stream().map(r -> {
            Message m = last.get(r.lastId());
            String name = m.getName();
            if (name == null) name = messages.findByChannelAndContactOrderByIdAsc(m.getChannel(), m.getContact()).stream()
                    .map(Message::getName).filter(Objects::nonNull).reduce((a, b) -> b).orElse(null);
            return new Thread(r.channel(), r.contact(), name, snippet(m.getBody()), m.getDirection(), m.getCreatedAt(),
                    r.unread(), r.received());
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
        List<Criteria> cs = new ArrayList<>();
        if (!isBlank(channel)) cs.add(Criteria.where("channel").is(channel));
        if (!isBlank(direction)) cs.add(Criteria.where("direction").is(direction));
        if (!isBlank(status)) cs.add(Criteria.where("status").is(status));
        if (from != null) cs.add(Criteria.where("createdAt").gte(from.atStartOfDay()));
        if (to != null) cs.add(Criteria.where("createdAt").lt(to.plusDays(1).atStartOfDay()));
        if (!isBlank(q)) cs.add(MongoQueries.containsAny(q, "contact", "name", "body", "voucher", "subject"));
        return PageDto.of(MongoQueries.page(mongo, MongoQueries.all(cs),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by(Sort.Direction.DESC, "id")), Message.class));
    }

    // ---------- Replying ----------

    public record ReplyResult(Message message, String link) {}

    public ReplyResult reply(String channel, String contact, String subject, String text) { return reply(channel, contact, subject, text, null); }

    /** Replies sent by the website (not wa.me links) cost one message from the admin's wallet; refunded if not sent. */
    public ReplyResult reply(String channel, String contact, String subject, String text, String admin) {
        if (isBlank(text)) throw ApiException.badRequest("Write a reply first");
        String name = messages.findByChannelAndContactOrderByIdAsc(channel, contact).stream()
                .map(Message::getName).filter(Objects::nonNull).reduce((a, b) -> b).orElse(null);
        switch (channel) {
            case "whatsapp", "web" -> {
                String phone = Contacts.phone(contact);
                if (phone == null) throw ApiException.badRequest("No valid WhatsApp number for this conversation");
                // Sent from the website (Meta or MSG91); without a connected provider it becomes a wa.me link.
                if (whatsapp.apiEnabled()) {
                    long paid = wallet == null ? 0 : wallet.chargeReply(admin, "whatsapp", phone);
                    try {
                        String id = whatsapp.send(phone, text, null, null, null);
                        return new ReplyResult(recordOut("whatsapp", phone, name, null, text, "sent", id), null);
                    } catch (Exception e) {
                        if (wallet != null) wallet.refundReply(admin, "whatsapp", phone, paid);
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
                long paid = wallet == null ? 0 : wallet.chargeReply(admin, "email", contact);
                String id;
                try {
                    id = mail.send(contact, subj, text, null);
                } catch (RuntimeException e) {
                    if (wallet != null) wallet.refundReply(admin, "email", contact, paid);
                    throw e;
                }
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
