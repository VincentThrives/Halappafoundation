package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.MongoQueries;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/** Creates bulk sends (WhatsApp / email / SMS) with optional entrance vouchers and controls their progress. */
@Service
@RequiredArgsConstructor
public class CampaignService {

    public static final Set<String> CHANNELS = Set.of("whatsapp", "email", "sms");

    private final CampaignRepository campaigns;
    private final MessageRepository messages;
    private final EnquiryService enquiries;
    private final WhatsAppService whatsapp;
    private final MailService mail;
    private final SmsService sms;
    private final CampaignRunner runner;
    private final SequenceService sequences;
    private final MongoTemplate mongo;
    private final WalletService wallet;

    @Value("${app.campaign.max-recipients:5000}")
    private int maxRecipients = 5000;

    // ---------- Request shapes ----------

    public record Person(String name, String phone, String email, String voucher) {}

    public record Voucher(String mode, String prefix, Integer start, Integer digits, String fixed) {}

    public record Request(
            String name,
            String channel,
            /** Rows from an Excel/CSV import (see ImportService). */
            List<Person> people,
            /** Selected enquiries, or every enquiry matching the filters when allEnquiries is true. */
            List<Long> enquiryIds,
            boolean allEnquiries,
            String q, String status, String enquiryChannel, String type, LocalDate from, LocalDate to,
            /** Extra numbers or emails pasted by the admin. */
            String pasted,
            String subject,
            String message,
            String template,
            String templateLang,
            /** WhatsApp only: open wa.me links by hand instead of the Cloud API. */
            boolean manual,
            Voucher voucher,
            /** WhatsApp template text with {{1}}, {{2}}… (for the log/preview; optional). */
            String templateBody,
            /** Values for {{1}}, {{2}}… in order; each may use {name} and {voucher}. Empty = name, voucher. */
            List<String> templateParams,
            /** The template's header type ("IMAGE" needs headerImage). */
            String templateHeader,
            /** Public https link of the photo for an IMAGE header (from the header-image upload). */
            String headerImage,
            /** SMS: values for the template's ##variables## (each may use {name} and {voucher}). */
            Map<String, String> smsVars) {}

    public record Stats(long total, long queued, long sent, long delivered, long read, long failed, long manual,
                        long cancelled, long attended) {}

    public record View(Campaign campaign, Stats stats) {}

    // ---------- Create ----------

    public View create(Request r, String admin) {
        String channel = r.channel() == null ? "" : r.channel().toLowerCase();
        if (!CHANNELS.contains(channel)) throw ApiException.badRequest("Choose WhatsApp, Email or SMS");
        if (isBlank(r.name())) throw ApiException.badRequest("Give this send a name, e.g. \"Kit distribution – Madhugiri\"");

        boolean manual = false;
        switch (channel) {
            case "whatsapp" -> {
                manual = r.manual() || !whatsapp.apiEnabled();
                boolean hasTemplate = !isBlank(r.template()) && !manual;
                if (!manual && whatsapp.bulkNeedsTemplate() && !hasTemplate)
                    throw ApiException.badRequest("WhatsApp through MSG91 needs an approved template: enter the template name exactly as in MSG91");
                if (hasTemplate && "IMAGE".equalsIgnoreCase(r.templateHeader()) && isBlank(r.headerImage()))
                    throw ApiException.badRequest("This template shows a photo at the top: upload the photo for this send");
                if (!isBlank(r.headerImage()) && !r.headerImage().trim().matches("(?i)https?://\\S+"))
                    throw ApiException.badRequest("The photo link isn't valid; upload the photo again");
                if (hasTemplate && !isBlank(r.templateBody())) {
                    int needed = Contacts.templateVariables(r.templateBody());
                    List<String> given = r.templateParams() == null ? List.of() : r.templateParams();
                    int filled = given.isEmpty() ? 2 : given.size(); // nothing given = {{1}} name, {{2}} voucher
                    for (int i = 0; i < needed; i++) {
                        if (i >= filled || (!given.isEmpty() && isBlank(given.get(i))))
                            throw ApiException.badRequest("Fill in {{" + (i + 1) + "}} of the template");
                    }
                }
                if (isBlank(r.message()) && !hasTemplate) throw ApiException.badRequest("Write the message (or give an approved template name)");
            }
            case "email" -> {
                if (!mail.enabled()) throw ApiException.badRequest("Email is not connected. Add SMTP details on the server first.");
                if (isBlank(r.subject()) || isBlank(r.message())) throw ApiException.badRequest("Email needs a subject and a message");
            }
            case "sms" -> {
                if (!sms.enabled()) throw ApiException.badRequest("SMS is not connected. Add MSG91 details on the server first.");
                if (isBlank(r.template()) && sms.defaultTemplate().isBlank())
                    throw ApiException.badRequest("Enter the MSG91 SMS template ID (MSG91 → SMS → Templates)");
                if (isBlank(r.message())) throw ApiException.badRequest("Paste the approved SMS text exactly as in MSG91");
                for (String var : Contacts.smsVariables(r.message())) {
                    boolean auto = var.equalsIgnoreCase("name") || var.equalsIgnoreCase("voucher");
                    String given = r.smsVars() == null ? null : r.smsVars().get(var);
                    if (!auto && isBlank(given)) throw ApiException.badRequest("Fill in ##" + var + "## of the SMS");
                }
            }
        }

        List<Person> people = recipients(r, channel);
        if (people.isEmpty()) throw ApiException.badRequest("No valid " + (channel.equals("email") ? "email addresses" : "phone numbers") + " to send to");
        if (people.size() > maxRecipients) throw ApiException.badRequest("Too many recipients: " + people.size() + ". The limit is " + maxRecipients + " per send.");

        Voucher v = r.voucher() == null ? new Voucher("none", null, null, null, null) : r.voucher();
        List<String> codes = vouchers(v, people);

        Campaign c = new Campaign();
        c.setName(r.name().trim());
        c.setChannel(channel);
        c.setMode(manual ? "manual" : "api");
        c.setSubject(cap(r.subject(), 300));
        c.setMessage(cap(r.message(), 4000));
        c.setTemplate(manual || isBlank(r.template()) ? null : r.template().trim());
        c.setTemplateLang(isBlank(r.templateLang()) ? "en" : r.templateLang().trim());
        if (c.getTemplate() != null) {
            c.setTemplateBody(isBlank(r.templateBody()) ? null : cap(r.templateBody().trim(), 4000));
            List<String> tp = r.templateParams() == null ? List.of()
                    : r.templateParams().stream().map(s -> cap(s == null ? "" : s.trim(), 500)).toList();
            c.setTemplateParams(tp.isEmpty() ? null : tp);
            c.setHeaderImage(isBlank(r.headerImage()) ? null : cap(r.headerImage().trim(), 1000));
        }
        List<String> smsVarNames = channel.equals("sms") ? Contacts.smsVariables(r.message()) : List.of();
        if (channel.equals("sms")) {
            c.setTemplate(isBlank(r.template()) ? null : cap(r.template().trim(), 100)); // null = server default
            c.setTemplateBody(null);
            c.setTemplateParams(null);
            Map<String, String> vars = new LinkedHashMap<>();
            for (String k : smsVarNames) {
                String val = r.smsVars() == null ? null : r.smsVars().get(k);
                if (!isBlank(val)) vars.put(k, cap(val.trim(), 500));
            }
            c.setSmsVars(vars.isEmpty() ? null : vars);
        }
        c.setVoucherMode(v.mode() == null ? "none" : v.mode());
        c.setVoucherInfo(voucherInfo(v, codes));
        c.setTotal(people.size());
        c.setStatus(manual ? "manual" : "running");
        c.setCreatedBy(admin);
        c = campaigns.save(c);

        // Automatic sends are paid from the admin's wallet up front; nothing is created if it doesn't cover them.
        if (!manual && admin != null) {
            try {
                wallet.chargeSend(c, admin, people.size());
            } catch (RuntimeException e) {
                campaigns.delete(c);
                throw e;
            }
            c = campaigns.save(c);
        }

        // Ids for all recipients in one round trip, then a single bulk insert (up to 5000 documents).
        long firstId = sequences.reserve("messages", people.size());
        List<Message> batch = new ArrayList<>(people.size());
        for (int i = 0; i < people.size(); i++) {
            Person p = people.get(i);
            String voucher = codes == null ? null : codes.get(i);
            Message m = new Message();
            m.setId(firstId + i);
            m.setCampaignId(c.getId());
            m.setChannel(channel);
            m.setDirection("out");
            m.setContact(channel.equals("email") ? p.email() : p.phone());
            m.setName(cap(p.name(), 150));
            m.setVoucher(voucher);
            m.setSubject(channel.equals("email") ? cap(Contacts.personalise(r.subject(), p.name(), voucher), 300) : null);
            String body = channel.equals("sms") && !smsVarNames.isEmpty()
                    // the SMS with this person's values in its ##variables##
                    ? Contacts.fillSms(r.message(), Contacts.smsValues(c.getSmsVars(), smsVarNames, p.name(), voucher))
                    : c.getTemplateBody() != null
                    // exactly what WhatsApp shows this person: the template with their values in {{1}}, {{2}}…
                    ? Contacts.fillTemplate(c.getTemplateBody(), Contacts.templateParams(c.getTemplateParams(), p.name(), voucher))
                    : Contacts.personalise(isBlank(r.message()) ? "[template " + c.getTemplate() + "]" : r.message(), p.name(), voucher);
            m.setBody(cap(body, 4000));
            m.setStatus(manual ? "manual" : "queued");
            batch.add(m);
        }
        mongo.insertAll(batch);

        if (!manual) runner.start(c.getId());
        return view(c);
    }

    /** Resolves and de-duplicates recipients from the import, enquiries and pasted text. */
    List<Person> recipients(Request r, String channel) {
        boolean email = channel.equals("email");
        Map<String, Person> byContact = new LinkedHashMap<>();
        java.util.function.Consumer<Person> add = p -> {
            String key = email ? Contacts.email(p.email()) : Contacts.phone(p.phone());
            if (key == null) return;
            byContact.putIfAbsent(key, new Person(p.name(), email ? null : key, email ? key : null, p.voucher()));
        };

        if (r.people() != null) r.people().forEach(add);
        boolean useIds = r.enquiryIds() != null && !r.enquiryIds().isEmpty();
        if (useIds || r.allEnquiries()) {
            var f = new EnquiryFilter(r.q(), r.status(), r.enquiryChannel(), r.type(), r.from(), r.to(), useIds ? r.enquiryIds() : null);
            enquiries.all(f).forEach(e -> add.accept(new Person(e.getName(), e.getPhone(), e.getEmail(), null)));
        }
        if (!isBlank(r.pasted())) {
            if (email) {
                for (String s : r.pasted().split("[,;\\s]+")) add.accept(new Person(null, null, s, null));
            } else {
                Contacts.parseNumbers(r.pasted()).forEach(p -> add.accept(new Person(null, p, null, null)));
            }
        }
        return new ArrayList<>(byContact.values());
    }

    /** One voucher per person (or null for none), checked for clashes with earlier sends. */
    List<String> vouchers(Voucher v, List<Person> people) {
        String mode = v.mode() == null ? "none" : v.mode();
        List<String> codes;
        switch (mode) {
            case "none" -> { return null; }
            case "fixed" -> {
                if (isBlank(v.fixed())) throw ApiException.badRequest("Enter the voucher code to give everyone");
                return Collections.nCopies(people.size(), v.fixed().trim().toUpperCase());
            }
            case "auto" -> {
                String prefix = v.prefix() == null ? "" : v.prefix().trim().toUpperCase();
                int start = v.start() == null ? 1 : v.start();
                int digits = v.digits() == null ? 4 : Math.max(1, Math.min(v.digits(), 8));
                if (start < 0) throw ApiException.badRequest("Voucher start number can't be negative");
                codes = new ArrayList<>(people.size());
                for (int i = 0; i < people.size(); i++) codes.add(prefix + String.format("%0" + digits + "d", start + i));
            }
            case "excel" -> {
                codes = new ArrayList<>(people.size());
                List<String> missing = new ArrayList<>();
                for (Person p : people) {
                    if (isBlank(p.voucher())) missing.add(isBlank(p.name()) ? (p.phone() != null ? p.phone() : p.email()) : p.name());
                    codes.add(isBlank(p.voucher()) ? null : p.voucher().trim().toUpperCase());
                }
                if (!missing.isEmpty())
                    throw ApiException.badRequest(missing.size() + " people have no voucher in the file, e.g. " + String.join(", ", missing.subList(0, Math.min(3, missing.size()))));
                Set<String> seen = new HashSet<>();
                for (String c : codes) if (!seen.add(c)) throw ApiException.badRequest("Voucher " + c + " appears twice in the file");
            }
            default -> throw ApiException.badRequest("Unknown voucher option");
        }
        // Unique vouchers must not collide with ones already issued.
        for (int i = 0; i < codes.size(); i += 1000) {
            List<String> taken = messages.existingVouchers(codes.subList(i, Math.min(codes.size(), i + 1000)));
            if (!taken.isEmpty())
                throw ApiException.badRequest("Voucher " + taken.get(0) + " was already issued earlier" +
                        (mode.equals("auto") ? ". Change the prefix or start number." : ". Use new voucher numbers."));
        }
        return codes;
    }

    private static String voucherInfo(Voucher v, List<String> codes) {
        if (codes == null || codes.isEmpty()) return null;
        if ("fixed".equals(v.mode())) return codes.get(0);
        return codes.get(0) + (codes.size() > 1 ? " – " + codes.get(codes.size() - 1) : "");
    }

    // ---------- Read ----------

    public List<View> list() { return campaigns.findTop50ByOrderByIdDesc().stream().map(this::view).toList(); }

    public View get(Long id) { return view(find(id)); }

    public View view(Campaign c) {
        Map<String, Long> by = messages.statusCounts(c.getId());
        long delivered = by.getOrDefault("delivered", 0L), read = by.getOrDefault("read", 0L);
        // "sent" counts everything that left, including later delivered/read receipts.
        long sent = by.getOrDefault("sent", 0L) + delivered + read;
        return new View(c, new Stats(c.getTotal(), by.getOrDefault("queued", 0L), sent, delivered + read, read,
                by.getOrDefault("failed", 0L), by.getOrDefault("manual", 0L), by.getOrDefault("cancelled", 0L),
                messages.countByCampaignIdAndAttendedAtIsNotNull(c.getId())));
    }

    public PageDto<Message> recipients(Long id, String status, String q, int page, int size) {
        find(id);
        List<Criteria> cs = new ArrayList<>();
        cs.add(Criteria.where("campaignId").is(id));
        if (!isBlank(status)) {
            if ("sent".equals(status)) cs.add(Criteria.where("status").in("sent", "delivered", "read"));
            else cs.add(Criteria.where("status").is(status));
        }
        if (!isBlank(q)) cs.add(MongoQueries.containsAny(q, "contact", "name", "voucher"));
        return PageDto.of(MongoQueries.page(mongo, MongoQueries.all(cs),
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 500), Sort.by("id")), Message.class));
    }

    public List<Message> allRecipients(Long id) { find(id); return messages.findByCampaignIdOrderByIdAsc(id); }

    // ---------- Control ----------

    public View pause(Long id) {
        Campaign c = find(id);
        if (!"running".equals(c.getStatus())) throw ApiException.badRequest("Only a running send can be paused");
        c.setStatus("paused");
        return view(campaigns.save(c));
    }

    public View resume(Long id) {
        Campaign c = find(id);
        if (!"paused".equals(c.getStatus())) throw ApiException.badRequest("Only a paused send can be resumed");
        c.setStatus("running");
        campaigns.save(c);
        runner.start(id);
        return view(c);
    }

    public View cancel(Long id) {
        Campaign c = find(id);
        if (Set.of("done", "cancelled").contains(c.getStatus())) throw ApiException.badRequest("This send has already finished");
        messages.moveStatus(id, "queued", "cancelled");
        c.setStatus("cancelled");
        c.setFinishedAt(LocalDateTime.now());
        c = campaigns.save(c);
        wallet.settle(c); // messages that won't go out are refunded
        return view(c);
    }

    public View retryFailed(Long id) {
        Campaign c = find(id);
        if ("manual".equals(c.getMode())) throw ApiException.badRequest("Manual sends are retried by opening the links again");
        if ("running".equals(c.getStatus())) throw ApiException.badRequest("Wait for the send to finish first");
        long failed = mongo.count(org.springframework.data.mongodb.core.query.Query.query(
                org.springframework.data.mongodb.core.query.Criteria.where("campaignId").is(id).and("status").is("failed")), Message.class);
        if (failed == 0) throw ApiException.badRequest("Nothing failed");
        if (c.getChargedTo() != null) {
            wallet.settle(c);                                   // failed ones were refunded…
            wallet.chargeSend(c, c.getChargedTo(), (int) failed); // …and are paid again for the retry (refused if short)
            c = campaigns.save(c);
        }
        messages.moveStatus(id, "failed", "queued");
        c.setStatus("running");
        c.setFinishedAt(null);
        campaigns.save(c);
        runner.start(id);
        return view(c);
    }

    /** Manual WhatsApp: the admin opened this person's chat link. */
    public Message markManualSent(Long campaignId, Long messageId) {
        Message m = messages.findById(messageId).filter(x -> campaignId.equals(x.getCampaignId()))
                .orElseThrow(() -> ApiException.notFound("Recipient"));
        if ("manual".equals(m.getStatus())) {
            m.setStatus("sent");
            m.setUpdatedAt(LocalDateTime.now());
            m = messages.save(m);
        }
        Campaign c = find(campaignId);
        if ("manual".equals(c.getStatus()) && view(c).stats().manual() == 0) {
            c.setStatus("done");
            c.setFinishedAt(LocalDateTime.now());
            campaigns.save(c);
        }
        return m;
    }

    /** Sends that were running when the server stopped carry on after restart. */
    @EventListener(ApplicationReadyEvent.class)
    public void resumeAfterRestart() {
        campaigns.findByStatus("running").forEach(c -> runner.start(c.getId()));
    }

    private Campaign find(Long id) { return campaigns.findById(id).orElseThrow(() -> ApiException.notFound("Send")); }
    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
    private static String cap(String s, int n) { return InboxService.cap(s, n); }
}
