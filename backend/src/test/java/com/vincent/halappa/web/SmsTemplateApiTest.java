package com.vincent.halappa.web;

import com.vincent.halappa.domain.SmsTemplateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Settings → SMS templates: saved once, picked from a list on the bulk SMS form. */
class SmsTemplateApiTest extends ApiTestBase {

    @Autowired SmsTemplateRepository templates;

    static final String TEXT = "ಮಾನ್ಯರೇ, ಹಾಲಪ್ಪ ಪ್ರತಿಷ್ಠಾನದ (Halappa Foundation) ವತಿಯಿಂದ ##event## ಕಾರ್ಯಕ್ರಮವನ್ನು ಆಯೋಜಿಸಲಾಗಿದೆ. "
            + "ದಿನಾಂಕ: ##date## ಸ್ಥಳ: ##place## ಸಮಯ: ##time## ಸಂಪರ್ಕಿಸಿ: ##contact## - Halappa Foundation";

    @BeforeEach
    void clean() { templates.deleteAll(); }

    private org.springframework.test.web.servlet.ResultActions save(String method, String url, Map<String, String> body) throws Exception {
        var req = "PUT".equals(method) ? put(url) : post(url);
        return mvc.perform(req.with(admin()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)));
    }

    @Test
    void addListEditDelete() throws Exception {
        String res = save("POST", "/api/admin/sms-templates",
                Map.of("name", "General invitation", "templateId", " 6ad492ac244b728bcb0f1234 ", "text", TEXT))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.templateId").value("6ad492ac244b728bcb0f1234"))
                .andExpect(jsonPath("$.updatedBy").value("admin"))
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        long id = read(res).path("id").asLong();
        save("POST", "/api/admin/sms-templates", Map.of("name", "Students competition", "templateId", "6ad49208a940436ce70c2b", "text", "Hi ##event##"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/admin/sms-templates").with(admin()))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("General invitation"))
                .andExpect(jsonPath("$[0].text").value(TEXT));

        save("PUT", "/api/admin/sms-templates/" + id, Map.of("name", "General invite", "templateId", "6ad492ac244b728bcb0f9999", "text", TEXT))
                .andExpect(jsonPath("$.name").value("General invite"))
                .andExpect(jsonPath("$.templateId").value("6ad492ac244b728bcb0f9999"));

        mvc.perform(delete("/api/admin/sms-templates/" + id).with(admin())).andExpect(status().isOk());
        mvc.perform(get("/api/admin/sms-templates").with(admin())).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void badEntriesAreRefusedWithAClearReason() throws Exception {
        save("POST", "/api/admin/sms-templates", Map.of("name", "", "templateId", "6ad492ac244b", "text", TEXT))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Give the template a name, e.g. \"General invitation\""));
        save("POST", "/api/admin/sms-templates", Map.of("name", "X", "templateId", "1.77718E+18", "text", TEXT))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Enter the MSG91 template ID")));
        // DLT's {#var#} form was pasted instead of MSG91's ##var##
        save("POST", "/api/admin/sms-templates", Map.of("name", "X", "templateId", "6ad492ac244b", "text", "Dear {#var#}, see you"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Use MSG91's ##variable## form")));
        save("PUT", "/api/admin/sms-templates/999999", Map.of("name", "X", "templateId", "6ad492ac244b", "text", TEXT))
                .andExpect(status().isNotFound());
    }

    @Test
    void needsAnAdmin() throws Exception {
        mvc.perform(get("/api/admin/sms-templates")).andExpect(status().isUnauthorized());
    }
}
