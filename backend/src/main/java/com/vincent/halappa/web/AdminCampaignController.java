package com.vincent.halappa.web;

import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.Message;
import com.vincent.halappa.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Bulk WhatsApp / Email / SMS sends ("campaigns") with Excel import and entrance vouchers. */
@RestController
@RequestMapping("/api/admin/campaigns")
@RequiredArgsConstructor
public class AdminCampaignController {

    private static final MediaType XLSX = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final CampaignService campaigns;
    private final ImportService importer;
    private final ExcelService excel;
    private final WhatsAppService whatsapp;
    private final MailService mail;
    private final SmsService sms;
    private final ImapPoller imap;
    private final FileStorageService files;

    /** Public address of this backend for links WhatsApp must download (e.g. https://halappa-api.onrender.com). */
    @org.springframework.beans.factory.annotation.Value("${app.public-url:}")
    private String publicUrl;

    /** Which channels can send and receive right now. */
    @GetMapping("/channels")
    public Map<String, Object> channels(@org.springframework.beans.factory.annotation.Value("${whatsapp.app-secret:}") String waSecret,
                                        @org.springframework.beans.factory.annotation.Value("${whatsapp.msg91.webhook-token:}") String msg91WebhookToken,
                                        @org.springframework.beans.factory.annotation.Value("${sms.inbound-token:}") String smsToken,
                                        @org.springframework.beans.factory.annotation.Value("${app.campaign.max-recipients:5000}") int max) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("whatsappApi", whatsapp.apiEnabled());
        m.put("whatsappProvider", whatsapp.provider());
        m.put("whatsappTemplatesOnly", whatsapp.apiEnabled() && whatsapp.bulkNeedsTemplate());
        // Replies arrive through Meta's signed webhook, or MSG91's webhook with its secret token.
        boolean msg91 = "msg91".equals(whatsapp.provider());
        m.put("whatsappInbound", whatsapp.apiEnabled() && !(msg91 ? msg91WebhookToken : waSecret).isBlank());
        m.put("email", mail.enabled());
        m.put("emailInbound", imap.enabled());
        m.put("sms", sms.enabled());
        m.put("smsTemplate", sms.defaultTemplate()); // MSG91_FLOW_ID, pre-filled on the SMS form
        m.put("smsInbound", !smsToken.isBlank());
        m.put("maxRecipients", max);
        return m;
    }

    /**
     * Approved WhatsApp templates to pick from (MSG91). When they can't be listed, available=false and the admin
     * types the template name and pastes its text instead.
     */
    @GetMapping("/whatsapp-templates")
    public Map<String, Object> whatsappTemplates() {
        Map<String, Object> m = new LinkedHashMap<>();
        try {
            List<WhatsAppService.Template> list = whatsapp.templates();
            m.put("available", list != null);
            m.put("templates", list == null ? List.of() : list);
            if (list == null) m.put("message", "Template list isn't available for this WhatsApp connection; type the name and paste the text.");
        } catch (Exception e) {
            m.put("available", false);
            m.put("templates", List.of());
            m.put("message", "Couldn't load templates: " + e.getMessage());
        }
        return m;
    }

    /**
     * Photo for a template with an IMAGE header. WhatsApp accepts JPG or PNG up to 5 MB and downloads it from the
     * returned public https link for every message.
     */
    @PostMapping(value = "/header-image", consumes = "multipart/form-data")
    public Map<String, String> headerImage(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) throw com.vincent.halappa.common.ApiException.badRequest("Choose a photo");
        String type = file.getContentType() == null ? "" : file.getContentType();
        if (!type.equals("image/jpeg") && !type.equals("image/png"))
            throw com.vincent.halappa.common.ApiException.badRequest("WhatsApp accepts JPG or PNG photos only");
        if (file.getSize() > 5L * 1024 * 1024)
            throw com.vincent.halappa.common.ApiException.badRequest("The photo is larger than 5 MB (WhatsApp's limit); use a smaller one");
        String path = files.store(file);
        String base = publicUrl == null || publicUrl.isBlank()
                ? org.springframework.web.servlet.support.ServletUriComponentsBuilder.fromCurrentContextPath().toUriString()
                : publicUrl.trim().replaceAll("/+$", "");
        return Map.of("path", path, "url", base + path);
    }

    @PostMapping(value = "/import", consumes = "multipart/form-data")
    public ImportService.Result importFile(@RequestParam("file") MultipartFile file) { return importer.read(file); }

    @GetMapping("/template")
    public ResponseEntity<byte[]> template() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"halappa-recipients-template.xlsx\"")
                .contentType(XLSX).body(excel.importTemplate());
    }

    @GetMapping
    public List<CampaignService.View> list() { return campaigns.list(); }

    @PostMapping
    public CampaignService.View create(@RequestBody CampaignService.Request r, Authentication auth) {
        return campaigns.create(r, auth == null ? null : auth.getName());
    }

    @GetMapping("/{id}")
    public CampaignService.View get(@PathVariable Long id) { return campaigns.get(id); }

    @GetMapping("/{id}/recipients")
    public PageDto<Message> recipients(@PathVariable Long id,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "50") int size) {
        return campaigns.recipients(id, status, q, page, size);
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<byte[]> export(@PathVariable Long id) {
        var view = campaigns.get(id);
        String safe = view.campaign().getName().replaceAll("[^A-Za-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"send-" + id + (safe.isEmpty() ? "" : "-" + safe) + ".xlsx\"")
                .contentType(XLSX).body(excel.campaign(view.campaign(), campaigns.allRecipients(id)));
    }

    @PostMapping("/{id}/pause") public CampaignService.View pause(@PathVariable Long id) { return campaigns.pause(id); }
    @PostMapping("/{id}/resume") public CampaignService.View resume(@PathVariable Long id) { return campaigns.resume(id); }
    @PostMapping("/{id}/cancel") public CampaignService.View cancel(@PathVariable Long id) { return campaigns.cancel(id); }
    @PostMapping("/{id}/retry-failed") public CampaignService.View retry(@PathVariable Long id) { return campaigns.retryFailed(id); }

    @PostMapping("/{id}/recipients/{messageId}/manual-sent")
    public Message manualSent(@PathVariable Long id, @PathVariable Long messageId) { return campaigns.markManualSent(id, messageId); }
}
