package com.vincent.halappa.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SMS through MSG91's Flow API (India, DLT compliant). The text people receive is the DLT-approved template
 * saved in MSG91 (its "template ID"); this service fills the template's ##variables## for each person.
 */
@Slf4j
@Service
public class SmsService {

    /** One person: their number and the values for the template's ##variables## (keys without the ##). */
    public record Recipient(String phone, Map<String, String> vars) {
        /** The classic invitation template with ##name## and ##voucher##. */
        public Recipient(String phone, String name, String voucher) {
            this(phone, nameAndVoucher(name, voucher));
        }

        private static Map<String, String> nameAndVoucher(String name, String voucher) {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("name", name == null ? "" : name);
            m.put("voucher", voucher == null ? "" : voucher);
            return m;
        }
    }

    private final String provider;
    private final String authKey;
    private final String flowId;
    private final RestClient http;

    public SmsService(@Value("${sms.provider:none}") String provider,
                      @Value("${sms.msg91.auth-key:}") String authKey,
                      @Value("${sms.msg91.flow-id:}") String flowId,
                      @Value("${sms.msg91.base-url:https://control.msg91.com}") String baseUrl) {
        this.provider = provider;
        this.authKey = authKey;
        this.flowId = flowId;
        this.http = RestClient.builder().baseUrl(baseUrl).build();
    }

    /** Connected to MSG91; the template ID can come from the server (MSG91_FLOW_ID) or be chosen per send. */
    public boolean enabled() { return "msg91".equalsIgnoreCase(provider) && !authKey.isBlank(); }

    /** The server's default MSG91 SMS template ID (MSG91_FLOW_ID), or "" when none is set. */
    public String defaultTemplate() { return flowId == null ? "" : flowId.trim(); }

    /** Sends with the server's default template. */
    public String sendBatch(List<Recipient> recipients) { return sendBatch(null, recipients); }

    /** One API call for up to ~100 recipients; returns MSG91's request id. */
    public String sendBatch(String templateId, List<Recipient> recipients) {
        String template = templateId == null || templateId.isBlank() ? defaultTemplate() : templateId.trim();
        if (template.isBlank()) throw new IllegalStateException("No MSG91 SMS template ID");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("template_id", template);
        body.put("short_url", "0");
        body.put("recipients", recipients.stream().map(r -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("mobiles", r.phone());
            if (r.vars() != null) r.vars().forEach((k, v) -> m.put(k, v == null ? "" : v));
            return m;
        }).toList());
        try {
            JsonNode res = http.post().uri("/api/v5/flow")
                    .header("authkey", authKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            log.info("MSG91 SMS {} recipients -> {}", recipients.size(), res == null ? "empty" : cap(res.toString()));
            if (res == null || !"success".equalsIgnoreCase(res.path("type").asText()))
                throw new IllegalStateException(res == null ? "Empty response" : res.path("message").asText("SMS failed"));
            return res.path("message").asText(null);
        } catch (RestClientResponseException e) {
            String msg = e.getResponseBodyAsString();
            throw new IllegalStateException(cap(msg));
        }
    }

    private static String cap(String s) { return s.length() > 400 ? s.substring(0, 400) : s; }
}
