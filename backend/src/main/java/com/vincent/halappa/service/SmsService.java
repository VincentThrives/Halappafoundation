package com.vincent.halappa.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SMS through MSG91's Flow API (India, DLT compliant). The text people receive is the DLT-approved
 * template configured in MSG91; this service fills its variables ##name## and ##voucher##.
 */
@Service
public class SmsService {

    public record Recipient(String phone, String name, String voucher) {}

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

    public boolean enabled() { return "msg91".equalsIgnoreCase(provider) && !authKey.isBlank() && !flowId.isBlank(); }

    /** One API call for up to ~100 recipients; returns MSG91's request id. */
    public String sendBatch(List<Recipient> recipients) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("template_id", flowId);
        body.put("short_url", "0");
        body.put("recipients", recipients.stream().map(r -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("mobiles", r.phone());
            m.put("name", r.name() == null ? "" : r.name());
            m.put("voucher", r.voucher() == null ? "" : r.voucher());
            return m;
        }).toList());
        try {
            JsonNode res = http.post().uri("/api/v5/flow")
                    .header("authkey", authKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            if (res == null || !"success".equalsIgnoreCase(res.path("type").asText()))
                throw new IllegalStateException(res == null ? "Empty response" : res.path("message").asText("SMS failed"));
            return res.path("message").asText(null);
        } catch (RestClientResponseException e) {
            String msg = e.getResponseBodyAsString();
            throw new IllegalStateException(msg.length() > 400 ? msg.substring(0, 400) : msg);
        }
    }
}
