package com.vincent.halappa.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Meta WhatsApp Business Cloud API client, plus wa.me helpers for manual mode. */
@Service
public class WhatsAppService {

    private final String token;
    private final String phoneNumberId;
    private final String apiVersion;
    private final RestClient http;

    public WhatsAppService(@Value("${whatsapp.token:}") String token,
                           @Value("${whatsapp.phone-number-id:}") String phoneNumberId,
                           @Value("${whatsapp.api-version:v21.0}") String apiVersion,
                           @Value("${whatsapp.base-url:https://graph.facebook.com}") String baseUrl) {
        this.token = token;
        this.phoneNumberId = phoneNumberId;
        this.apiVersion = apiVersion;
        this.http = RestClient.builder().baseUrl(baseUrl).build();
    }

    public boolean apiEnabled() { return !token.isBlank() && !phoneNumberId.isBlank(); }

    /** Kept for callers that only need number clean-up. */
    public static String normalize(String phone) { return Contacts.phone(phone); }

    public static String link(String phone, String text) {
        return "https://wa.me/" + phone + "?text=" + URLEncoder.encode(text, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /**
     * Sends one message and returns Meta's message id (wamid), used to match delivery/read receipts.
     * Free text only reaches people who messaged in the last 24h; invitations need an approved template.
     */
    public String send(String to, String text, String template, String lang, List<String> params) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("messaging_product", "whatsapp");
        body.put("to", to);
        if (template != null && !template.isBlank()) {
            Map<String, Object> tpl = new LinkedHashMap<>();
            tpl.put("name", template);
            tpl.put("language", Map.of("code", lang == null || lang.isBlank() ? "en" : lang));
            if (params != null && !params.isEmpty()) {
                tpl.put("components", List.of(Map.of("type", "body",
                        "parameters", params.stream().map(p -> Map.of("type", "text", "text", p)).toList())));
            }
            body.put("type", "template");
            body.put("template", tpl);
        } else {
            body.put("type", "text");
            body.put("text", Map.of("body", text, "preview_url", true));
        }
        try {
            JsonNode res = http.post()
                    .uri("/{v}/{id}/messages", apiVersion, phoneNumberId)
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            return res != null && res.path("messages").has(0) ? res.path("messages").get(0).path("id").asText(null) : null;
        } catch (RestClientResponseException e) {
            String msg = e.getResponseBodyAsString();
            throw new IllegalStateException(msg.length() > 400 ? msg.substring(0, 400) : msg);
        }
    }
}
