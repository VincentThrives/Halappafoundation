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

    /** Which channels can send and receive right now. */
    @GetMapping("/channels")
    public Map<String, Object> channels(@org.springframework.beans.factory.annotation.Value("${whatsapp.app-secret:}") String waSecret,
                                        @org.springframework.beans.factory.annotation.Value("${sms.inbound-token:}") String smsToken,
                                        @org.springframework.beans.factory.annotation.Value("${app.campaign.max-recipients:5000}") int max) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("whatsappApi", whatsapp.apiEnabled());
        m.put("whatsappInbound", whatsapp.apiEnabled() && !waSecret.isBlank());
        m.put("email", mail.enabled());
        m.put("emailInbound", imap.enabled());
        m.put("sms", sms.enabled());
        m.put("smsInbound", !smsToken.isBlank());
        m.put("maxRecipients", max);
        return m;
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
