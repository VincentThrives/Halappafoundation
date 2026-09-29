package com.vincent.halappa.web;

import com.vincent.halappa.domain.GalleryItemRepository;
import com.vincent.halappa.domain.PostRepository;
import com.vincent.halappa.domain.TimelineEntryRepository;
import com.vincent.halappa.service.EnquiryService;
import com.vincent.halappa.service.MailService;
import com.vincent.halappa.service.SettingsService;
import com.vincent.halappa.service.WhatsAppService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminSettingsController {

    private final SettingsService settings;
    private final EnquiryService enquiries;
    private final PostRepository posts;
    private final GalleryItemRepository gallery;
    private final TimelineEntryRepository timeline;
    private final MailService mail;
    private final WhatsAppService whatsapp;

    @GetMapping("/settings")
    public Map<String, String> get() { return settings.all(); }

    @PutMapping("/settings")
    public Map<String, String> put(@RequestBody Map<String, String> values) { return settings.update(values); }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("enquiries", enquiries.stats());
        m.put("posts", posts.count());
        m.put("photos", gallery.count());
        m.put("timeline", timeline.count());
        m.put("mailEnabled", mail.enabled());
        m.put("whatsappApiEnabled", whatsapp.apiEnabled());
        return m;
    }
}
