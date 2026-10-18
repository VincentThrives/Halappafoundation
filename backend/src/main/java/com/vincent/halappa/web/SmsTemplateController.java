package com.vincent.halappa.web;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.domain.SmsTemplate;
import com.vincent.halappa.domain.SmsTemplateRepository;
import com.vincent.halappa.service.Contacts;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/** Settings → SMS templates: the DLT-approved texts bulk SMS picks from (no server restart needed to add one). */
@RestController
@RequestMapping("/api/admin/sms-templates")
@RequiredArgsConstructor
public class SmsTemplateController {

    private final SmsTemplateRepository templates;

    public record Form(String name, String templateId, String text) {}

    @GetMapping
    public List<SmsTemplate> list() { return templates.findAllByOrderByNameAsc(); }

    @PostMapping
    public SmsTemplate add(@RequestBody Form f, Authentication auth) { return templates.save(apply(new SmsTemplate(), f, auth)); }

    @PutMapping("/{id}")
    public SmsTemplate update(@PathVariable Long id, @RequestBody Form f, Authentication auth) {
        SmsTemplate t = templates.findById(id).orElseThrow(() -> ApiException.notFound("SMS template"));
        return templates.save(apply(t, f, auth));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) { templates.deleteById(id); }

    private static SmsTemplate apply(SmsTemplate t, Form f, Authentication auth) {
        String name = f.name() == null ? "" : f.name().trim();
        String id = f.templateId() == null ? "" : f.templateId().trim();
        String text = f.text() == null ? "" : f.text().trim();
        if (name.isEmpty()) throw ApiException.badRequest("Give the template a name, e.g. \"General invitation\"");
        if (name.length() > 100) throw ApiException.badRequest("Name is too long (100 characters max)");
        if (!id.matches("[A-Za-z0-9_-]{6,60}")) throw ApiException.badRequest("Enter the MSG91 template ID (letters and numbers, from MSG91 → SMS → Templates)");
        if (text.isEmpty()) throw ApiException.badRequest("Paste the approved SMS text exactly as in MSG91");
        if (text.length() > 2000) throw ApiException.badRequest("SMS text is too long (2000 characters max)");
        if (text.contains("{#")) throw ApiException.badRequest("Use MSG91's ##variable## form, not DLT's {#var#}: e.g. ##event##, ##date##");
        if (Contacts.smsVariables(text).size() > 20) throw ApiException.badRequest("Too many ##variables## (20 max)");
        t.setName(name);
        t.setTemplateId(id);
        t.setText(text);
        t.setUpdatedBy(auth == null ? null : auth.getName());
        t.setUpdatedAt(LocalDateTime.now());
        return t;
    }
}
