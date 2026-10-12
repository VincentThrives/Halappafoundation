package com.vincent.halappa.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Autowired;
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

/**
 * Sends WhatsApp messages through one of two providers, chosen by {@code whatsapp.provider}:
 * <ul>
 *   <li>{@code meta}: Meta's WhatsApp Business Cloud API directly (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID);</li>
 *   <li>{@code msg91}: MSG91's WhatsApp API (MSG91_AUTH_KEY + MSG91_WHATSAPP_NUMBER): templates for bulk sends,
 *       free text for replies; replies and receipts arrive on /api/webhooks/msg91-whatsapp.</li>
 * </ul>
 * Plus wa.me helpers for manual mode when neither is connected.
 */
@Service
public class WhatsAppService {

    private final String provider;
    private final String token;
    private final String phoneNumberId;
    private final String apiVersion;
    private final RestClient http;
    private final String msg91AuthKey;
    private final String msg91Number;
    private final String msg91Namespace;
    private final RestClient msg91;
    private final RestClient msg91Control;

    @Autowired
    public WhatsAppService(@Value("${whatsapp.provider:meta}") String provider,
                           @Value("${whatsapp.token:}") String token,
                           @Value("${whatsapp.phone-number-id:}") String phoneNumberId,
                           @Value("${whatsapp.api-version:v21.0}") String apiVersion,
                           @Value("${whatsapp.base-url:https://graph.facebook.com}") String baseUrl,
                           @Value("${sms.msg91.auth-key:}") String msg91AuthKey,
                           @Value("${whatsapp.msg91.integrated-number:}") String msg91Number,
                           @Value("${whatsapp.msg91.namespace:}") String msg91Namespace,
                           @Value("${whatsapp.msg91.base-url:https://api.msg91.com}") String msg91BaseUrl,
                           @Value("${whatsapp.msg91.control-url:https://control.msg91.com}") String msg91ControlUrl) {
        this.provider = "msg91".equalsIgnoreCase(provider == null ? "" : provider.trim()) ? "msg91" : "meta";
        this.token = token;
        this.phoneNumberId = phoneNumberId;
        this.apiVersion = apiVersion;
        this.http = RestClient.builder().baseUrl(baseUrl).build();
        this.msg91AuthKey = msg91AuthKey == null ? "" : msg91AuthKey;
        this.msg91Number = msg91Number == null ? "" : Contacts.phone(msg91Number) == null ? msg91Number.trim() : Contacts.phone(msg91Number);
        this.msg91Namespace = msg91Namespace == null ? "" : msg91Namespace.trim();
        this.msg91 = RestClient.builder().baseUrl(msg91BaseUrl).build();
        this.msg91Control = RestClient.builder().baseUrl(msg91ControlUrl).build();
    }

    /** Meta-only setup (kept for callers and tests that don't use MSG91). */
    public WhatsAppService(String token, String phoneNumberId, String apiVersion, String baseUrl) {
        this("meta", token, phoneNumberId, apiVersion, baseUrl, "", "", "", "https://api.msg91.com", "https://control.msg91.com");
    }

    /** "meta" or "msg91". */
    public String provider() { return provider; }

    public boolean apiEnabled() {
        return isMsg91() ? !msg91AuthKey.isBlank() && !msg91Number.isBlank() : !token.isBlank() && !phoneNumberId.isBlank();
    }

    /**
     * Bulk sends through MSG91 must use an approved template (they reach people who haven't messaged recently).
     * One-to-one replies can still be free text within WhatsApp's 24-hour window.
     */
    public boolean bulkNeedsTemplate() { return isMsg91(); }

    private boolean isMsg91() { return "msg91".equals(provider); }

    /** An approved WhatsApp template: its full text with {{1}}, {{2}}… and how many of those it has. */
    public record Template(String name, String language, String status, String body, int variables) {}

    /**
     * Approved templates for the connected number, read from MSG91 (MSG91 → WhatsApp → Templates).
     * Returns null when the provider can't list them (Meta here), so the admin types the name and text instead.
     */
    public List<Template> templates() {
        if (!isMsg91() || !apiEnabled()) return null;
        JsonNode res;
        try {
            res = msg91Control.get()
                    .uri("/api/v5/whatsapp/get-template-client/{number}", msg91Number)
                    .header("authkey", msg91AuthKey)
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException e) {
            throw new IllegalStateException("MSG91: " + cap(e.getResponseBodyAsString()));
        }
        if (res == null) return List.of();
        if (res.path("hasError").asBoolean(false) || "fail".equalsIgnoreCase(res.path("status").asText()))
            throw new IllegalStateException("MSG91: " + cap(firstText(res, "errors", "message")));
        JsonNode list = res.isArray() ? res : res.path("data").isArray() ? res.path("data")
                : res.path("data").path("data").isArray() ? res.path("data").path("data") : res.path("templates");
        java.util.List<Template> out = new java.util.ArrayList<>();
        for (JsonNode t : list) {
            String name = text(t, "name", "template_name");
            if (name == null) continue;
            JsonNode langs = t.path("languages").isArray() ? t.path("languages") : new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode().add(t);
            for (JsonNode l : langs) {
                String status = text(l, "status", "template_status");
                if (status == null) status = text(t, "status", "template_status");
                if (status != null && !status.equalsIgnoreCase("approved")) continue;
                String lang = text(l, "language", "code", "lang");
                if (lang == null || lang.startsWith("[")) lang = text(t, "language", "template_language");
                String body = bodyText(l);
                if (body == null) body = bodyText(t);
                out.add(new Template(name, lang == null ? "en" : lang, status == null ? "APPROVED" : status.toUpperCase(),
                        body, Contacts.templateVariables(body)));
            }
        }
        return out;
    }

    /** The BODY text of a template node (components/code may be an array or a JSON string). */
    private static String bodyText(JsonNode n) {
        for (String key : new String[] { "code", "components" }) {
            JsonNode c = n.path(key);
            if (c.isTextual() && c.asText().trim().startsWith("[")) {
                try { c = new com.fasterxml.jackson.databind.ObjectMapper().readTree(c.asText()); } catch (Exception ignored) { }
            }
            if (c.isArray()) {
                for (JsonNode part : c) if ("BODY".equalsIgnoreCase(part.path("type").asText())) return part.path("text").asText(null);
            }
        }
        return text(n, "body", "text", "template_body");
    }

    private static String text(JsonNode n, String... keys) {
        for (String k : keys) {
            JsonNode v = n.path(k);
            if (v.isValueNode() && !v.asText().isBlank()) return v.asText();
        }
        return null;
    }

    /** Kept for callers that only need number clean-up. */
    public static String normalize(String phone) { return Contacts.phone(phone); }

    public static String link(String phone, String text) {
        return "https://wa.me/" + phone + "?text=" + URLEncoder.encode(text, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /**
     * Sends one message and returns the provider's message/request id (used to match delivery receipts).
     * Free text only reaches people who messaged in the last 24h; invitations need an approved template.
     */
    public String send(String to, String text, String template, String lang, List<String> params) {
        if (!isMsg91()) return sendMeta(to, text, template, lang, params);
        return template == null || template.isBlank() ? sendMsg91Text(to, text) : sendMsg91(to, template, lang, params);
    }

    /**
     * MSG91 "session" message: plain text, accepted only within 24 hours of the person's last message to us
     * (WhatsApp's rule). Used for Inbox replies.
     */
    private String sendMsg91Text(String to, String text) {
        if (text == null || text.isBlank()) throw new IllegalStateException("Write the message first");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("integrated_number", msg91Number);
        body.put("recipient_number", to);
        body.put("content_type", "text");
        body.put("text", text);
        return postMsg91("/api/v5/whatsapp/whatsapp-outbound-message/", body);
    }

    private String sendMeta(String to, String text, String template, String lang, List<String> params) {
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
            throw new IllegalStateException(cap(e.getResponseBodyAsString()));
        }
    }

    /**
     * MSG91 WhatsApp template message. The template's {{1}}, {{2}}… are filled from params
     * (MSG91 names them body_1, body_2…): for invitations {{1}} = name, {{2}} = voucher.
     */
    private String sendMsg91(String to, String template, String lang, List<String> params) {
        if (template == null || template.isBlank())
            throw new IllegalStateException("MSG91 sends approved WhatsApp templates only; give the template name");
        Map<String, Object> components = new LinkedHashMap<>();
        if (params != null) {
            for (int i = 0; i < params.size(); i++)
                components.put("body_" + (i + 1), Map.of("type", "text", "value", params.get(i) == null ? "" : params.get(i)));
        }
        Map<String, Object> tpl = new LinkedHashMap<>();
        tpl.put("name", template.trim());
        tpl.put("language", Map.of("code", lang == null || lang.isBlank() ? "en" : lang.trim(), "policy", "deterministic"));
        if (!msg91Namespace.isBlank()) tpl.put("namespace", msg91Namespace);
        tpl.put("to_and_components", List.of(Map.of("to", List.of(to), "components", components)));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("messaging_product", "whatsapp");
        payload.put("type", "template");
        payload.put("template", tpl);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("integrated_number", msg91Number);
        body.put("content_type", "template");
        body.put("payload", payload);
        return postMsg91("/api/v5/whatsapp/whatsapp-outbound-message/bulk/", body);
    }

    /** Posts to MSG91 and returns its request id; MSG91 errors (HTTP or in the body) become exceptions. */
    private String postMsg91(String path, Map<String, Object> body) {
        try {
            JsonNode res = msg91.post()
                    .uri(path)
                    .header("authkey", msg91AuthKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            if (res == null) throw new IllegalStateException("MSG91: empty response");
            boolean failed = res.path("hasError").asBoolean(false)
                    || "fail".equalsIgnoreCase(res.path("status").asText())
                    || "error".equalsIgnoreCase(res.path("type").asText());
            if (failed) throw new IllegalStateException("MSG91: " + cap(firstText(res, "errors", "message", "data")));
            String id = firstText(res, "request_id", "requestId", "data");
            return id == null || id.isBlank() ? null : cap(id);
        } catch (RestClientResponseException e) {
            throw new IllegalStateException("MSG91: " + cap(e.getResponseBodyAsString()));
        }
    }

    /** First non-empty field among names (text, or JSON for objects/arrays; also looks one level inside "data"). */
    private static String firstText(JsonNode res, String... names) {
        for (String n : names) {
            JsonNode v = res.path(n);
            if (v.isMissingNode() || v.isNull()) v = res.path("data").path(n);
            if (v.isMissingNode() || v.isNull()) continue;
            String s = v.isValueNode() ? v.asText() : v.toString();
            if (!s.isBlank()) return s;
        }
        return res.toString();
    }

    private static String cap(String s) { return s == null ? null : s.length() > 400 ? s.substring(0, 400) : s; }
}
