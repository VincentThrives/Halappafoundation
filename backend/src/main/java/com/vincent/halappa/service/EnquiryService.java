package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.domain.Enquiry;
import com.vincent.halappa.domain.EnquiryRepository;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class EnquiryService {

    public static final Set<String> TYPES = Set.of("query", "request", "grievance", "invitation", "volunteer", "other");
    public static final Set<String> STATUSES = Set.of("new", "in-progress", "resolved");

    private final EnquiryRepository repo;
    private final MailService mail;
    private final SettingsService settings;
    private final InboxService inbox;
    private final com.vincent.halappa.domain.MessageRepository messages;

    public record EnquiryRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Pattern(regexp = "^[+0-9 ()-]{10,16}$", message = "enter a valid mobile number") String phone,
            @Email @Size(max = 150) String email,
            @Size(max = 80) String district,
            @Size(max = 120) String taluk,
            @Size(max = 30) String type,
            @Size(max = 200) String subject,
            @NotBlank @Size(max = 4000) String message,
            @NotBlank @Pattern(regexp = "email|whatsapp") String channel,
            @Size(max = 5) String lang,
            /** Honeypot: humans never see or fill this field. */
            String website) {}

    public record Created(Long id, String whatsappUrl) {}

    public Created create(EnquiryRequest r) {
        if (r.website() != null && !r.website().isBlank()) throw ApiException.badRequest("Rejected");
        if (WhatsAppService.normalize(r.phone()) == null) throw ApiException.badRequest("phone: enter a valid mobile number");

        Enquiry e = new Enquiry();
        e.setName(r.name().trim());
        e.setPhone(r.phone().replaceAll("[^0-9+]", ""));
        e.setEmail(blankToNull(r.email()));
        e.setDistrict(blankToNull(r.district()));
        e.setTaluk(blankToNull(r.taluk()));
        e.setType(r.type() != null && TYPES.contains(r.type()) ? r.type() : "query");
        e.setSubject(blankToNull(r.subject()));
        e.setMessage(r.message().trim());
        e.setChannel(r.channel());
        e.setLang("kn".equals(r.lang()) ? "kn" : "en");
        e = repo.save(e);

        // Also show it in the admin Inbox as a message received through the website.
        String body = (e.getSubject() != null ? e.getSubject() + "\n\n" : "") + e.getMessage()
                + "\n\n— Ref #" + e.getId() + " · " + e.getType() + (e.getDistrict() != null ? " · " + e.getDistrict() : "")
                + " · sent via " + e.getChannel();
        inbox.recordIn("web", Contacts.phone(e.getPhone()), e.getName(), e.getSubject(), body, "enquiry-" + e.getId());

        mail.enquiryReceived(e);

        String waUrl = null;
        if ("whatsapp".equals(e.getChannel())) {
            String text = "Halappa Foundation | Ref #" + e.getId() + "\n"
                    + "Name: " + e.getName() + "\n"
                    + (e.getDistrict() != null ? "District: " + e.getDistrict() + "\n" : "")
                    + "Type: " + e.getType() + "\n"
                    + (e.getSubject() != null ? "Subject: " + e.getSubject() + "\n" : "")
                    + "\n" + e.getMessage();
            waUrl = "https://wa.me/" + settings.get("whatsapp") + "?text=" + URLEncoder.encode(text, StandardCharsets.UTF_8).replace("+", "%20");
        }
        return new Created(e.getId(), waUrl);
    }

    public Page<Enquiry> search(EnquiryFilter f, int page, int size) {
        return repo.findAll(f.toSpec(), PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200), Sort.by(Sort.Direction.DESC, "id")));
    }

    public List<Enquiry> all(EnquiryFilter f) {
        return repo.findAll(f.toSpec(), Sort.by(Sort.Direction.DESC, "id"));
    }

    public Enquiry update(Long id, String status, String notes) {
        Enquiry e = repo.findById(id).orElseThrow(() -> ApiException.notFound("Enquiry"));
        if (status != null) {
            if (!STATUSES.contains(status)) throw ApiException.badRequest("Unknown status");
            e.setStatus(status);
        }
        if (notes != null) e.setNotes(notes.length() > 2000 ? notes.substring(0, 2000) : notes);
        return repo.save(e);
    }

    /** Deletes the enquiries and their copies in the admin Inbox. */
    @org.springframework.transaction.annotation.Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("Select at least one enquiry");
        repo.deleteAllById(ids);
        messages.deleteIncomingByProviderIds(ids.stream().map(id -> "enquiry-" + id).toList());
    }

    public Map<String, Long> stats() {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("total", repo.count());
        for (String s : STATUSES) m.put(s, repo.countByStatus(s));
        m.put("email", repo.countByChannel("email"));
        m.put("whatsapp", repo.countByChannel("whatsapp"));
        return m;
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
