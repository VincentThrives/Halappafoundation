package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vincent.halappa.service.Contacts;
import com.vincent.halappa.service.InboxService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/**
 * Incoming messages and delivery receipts from providers.
 * WhatsApp: set the Callback URL in Meta to https://<site>/api/webhooks/whatsapp with WHATSAPP_VERIFY_TOKEN,
 * and WHATSAPP_APP_SECRET so every call is signature-checked.
 * SMS: point the provider's inbound-SMS webhook at /api/webhooks/sms?token=SMS_INBOUND_TOKEN.
 */
@Slf4j
@RestController
@RequestMapping("/api/webhooks")
public class WebhookController {

    private final InboxService inbox;
    private final ObjectMapper json;
    private final String verifyToken;
    private final String appSecret;
    private final String smsToken;
    private final String msg91Token;

    public WebhookController(InboxService inbox, ObjectMapper json,
                             @Value("${whatsapp.verify-token:}") String verifyToken,
                             @Value("${whatsapp.app-secret:}") String appSecret,
                             @Value("${sms.inbound-token:}") String smsToken,
                             @Value("${whatsapp.msg91.webhook-token:}") String msg91Token) {
        this.inbox = inbox;
        this.json = json;
        this.verifyToken = verifyToken;
        this.appSecret = appSecret;
        this.smsToken = smsToken;
        this.msg91Token = msg91Token;
    }

    // ---------- WhatsApp ----------

    /** Meta's one-time subscription check. */
    @GetMapping("/whatsapp")
    public ResponseEntity<String> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                         @RequestParam(name = "hub.verify_token", required = false) String token,
                                         @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if ("subscribe".equals(mode) && !verifyToken.isBlank() && verifyToken.equals(token)) return ResponseEntity.ok(challenge);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden");
    }

    @PostMapping("/whatsapp")
    public ResponseEntity<Void> whatsapp(@RequestBody String raw,
                                         @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) throws Exception {
        if (!validSignature(raw, signature)) {
            log.warn("Rejected WhatsApp webhook with a missing or bad signature");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        JsonNode root = json.readTree(raw);
        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                JsonNode v = change.path("value");
                String profileName = v.path("contacts").path(0).path("profile").path("name").asText(null);
                for (JsonNode m : v.path("messages")) {
                    String from = Contacts.phone(m.path("from").asText());
                    if (from == null) continue;
                    inbox.recordIn("whatsapp", from, profileName, null, whatsappText(m), m.path("id").asText(null));
                }
                for (JsonNode s : v.path("statuses")) {
                    JsonNode err = s.path("errors").path(0);
                    String error = err.isMissingNode() ? null
                            : (err.path("title").asText("") + " " + err.path("error_data").path("details").asText(err.path("message").asText(""))).trim();
                    inbox.updateStatus(s.path("id").asText(), s.path("status").asText(), error);
                }
            }
        }
        return ResponseEntity.ok().build();
    }

    private boolean validSignature(String raw, String header) throws Exception {
        if (appSecret.isBlank() || header == null || !header.startsWith("sha256=")) return false;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String expected = HexFormat.of().formatHex(mac.doFinal(raw.getBytes(StandardCharsets.UTF_8)));
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), header.substring(7).getBytes(StandardCharsets.UTF_8));
    }

    static String whatsappText(JsonNode m) {
        String type = m.path("type").asText();
        return switch (type) {
            case "text" -> m.path("text").path("body").asText();
            case "button" -> m.path("button").path("text").asText();
            case "interactive" -> m.path("interactive").path("button_reply").path("title")
                    .asText(m.path("interactive").path("list_reply").path("title").asText("[interactive]"));
            case "image", "video", "document" -> "[" + type + "] " + m.path(type).path("caption").asText("");
            case "location" -> "[location] " + m.path("location").path("latitude").asText() + "," + m.path("location").path("longitude").asText();
            default -> "[" + type + "]";
        };
    }

    // ---------- WhatsApp through MSG91 ----------

    /**
     * MSG91 → WhatsApp → Webhook, for both Inbound and Outbound: .../api/webhooks/msg91-whatsapp?token=MSG91_WEBHOOK_TOKEN.
     * Inbound = a person's message (saved to the Inbox); outbound = delivery status of what we sent (matched by MSG91's
     * request id). Accepts one event, a list, or {"data": [...]}; some MSG91 fields hold JSON as a string.
     * Always answers 200 quickly (MSG91 drops slow calls), duplicates are ignored.
     */
    @PostMapping("/msg91-whatsapp")
    public ResponseEntity<Void> msg91WhatsApp(@RequestParam(name = "token", required = false) String token,
                                              @RequestBody(required = false) String raw) {
        if (msg91Token.isBlank() || !msg91Token.equals(token)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            JsonNode root = json.readTree(raw == null || raw.isBlank() ? "{}" : raw);
            JsonNode events = root.isArray() ? root : root.path("data").isArray() ? root.path("data") : json.createArrayNode().add(root);
            for (JsonNode e : events) msg91Event(e);
        } catch (Exception ex) {
            log.warn("Could not read MSG91 WhatsApp webhook: {} | {}", ex.getMessage(), raw == null ? "" : raw.substring(0, Math.min(raw.length(), 500)));
        }
        return ResponseEntity.ok().build();
    }

    private void msg91Event(JsonNode e) {
        String direction = e.path("direction").asText("").toLowerCase();
        String customer = Contacts.phone(firstOf(e, "customer_number", "customerNumber", "mobile", "sender", "from"));
        String status = e.path("status").asText("").toLowerCase();
        boolean inbound = direction.startsWith("in") || (direction.isEmpty() && status.isEmpty() && customer != null);
        if (inbound) {
            if (customer == null) { log.warn("MSG91 inbound WhatsApp without a customer number: {}", cap(e)); return; }
            String id = firstOf(e, "message_uuid", "uuid", "messageId", "id", "request_id");
            String name = firstOf(e, "customer_name", "profile_name", "name");
            inbox.recordIn("whatsapp", customer, name, null, msg91Text(e), id);
            return;
        }
        String mapped = switch (status) {
            case "submitted", "sent" -> "sent";
            case "delivered" -> "delivered";
            case "read", "seen" -> "read";
            case "failed", "rejected", "undelivered" -> "failed";
            default -> null;
        };
        if (mapped == null) return;
        String error = "failed".equals(mapped) ? firstOf(e, "failure_reason", "reason", "error", "errors", "description") : null;
        for (String key : new String[] { "request_id", "requestId", "message_uuid", "uuid" }) {
            String id = e.path(key).asText(null);
            if (id != null && !id.isBlank()) inbox.updateStatus(id, mapped, error);
        }
    }

    /** The person's message text from an MSG91 inbound event (text, button, caption or the message type). */
    String msg91Text(JsonNode e) {
        for (String key : new String[] { "content", "text", "message", "body" }) {
            JsonNode v = parsed(e.path(key));
            if (v.isTextual() && !v.asText().isBlank()) return v.asText();
            if (v.isObject()) {
                for (String inner : new String[] { "text", "body", "caption", "title", "payload" }) {
                    JsonNode t = parsed(v.path(inner));
                    if (t.isTextual() && !t.asText().isBlank()) return t.asText();
                    if (t.path("body").isTextual()) return t.path("body").asText();
                }
            }
        }
        JsonNode msgs = parsed(e.path("messages"));
        if (msgs.isArray() && msgs.size() > 0) return whatsappText(msgs.get(0));
        String type = e.path("message_type").asText(e.path("contentType").asText("message"));
        return "[" + type + "]";
    }

    /** MSG91 sends some values as JSON inside a string; parse those, leave plain text alone. */
    private JsonNode parsed(JsonNode v) {
        if (v.isTextual()) {
            String s = v.asText().trim();
            if (s.startsWith("{") || s.startsWith("[")) {
                try { return json.readTree(s); } catch (Exception ignored) { }
            }
        }
        return v;
    }

    private static String firstOf(JsonNode e, String... keys) {
        for (String k : keys) {
            JsonNode v = e.path(k);
            if (!v.isMissingNode() && !v.isNull()) {
                String s = v.isValueNode() ? v.asText() : v.toString();
                if (!s.isBlank()) return s;
            }
        }
        return null;
    }

    private static String cap(JsonNode e) { String s = e.toString(); return s.length() > 500 ? s.substring(0, 500) : s; }

    // ---------- SMS ----------

    /** Accepts JSON or form posts; common field names from Indian SMS providers are recognised. */
    @PostMapping(value = "/sms")
    public ResponseEntity<Void> sms(@RequestParam(name = "token", required = false) String token,
                                    @RequestParam Map<String, String> form,
                                    @RequestBody(required = false) String raw) throws Exception {
        if (smsToken.isBlank() || !smsToken.equals(token)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        Map<String, String> f = new java.util.HashMap<>(form);
        if (raw != null && raw.trim().startsWith("{")) {
            json.readTree(raw).fields().forEachRemaining(e -> f.putIfAbsent(e.getKey(), e.getValue().asText()));
        }
        String from = Contacts.phone(first(f, "from", "sender", "mobile", "number", "msisdn", "phone"));
        String text = first(f, "message", "text", "content", "body", "sms", "keyword");
        if (from == null || text == null) return ResponseEntity.badRequest().build();
        inbox.recordIn("sms", from, null, null, text, first(f, "id", "messageId", "requestId"));
        return ResponseEntity.ok().build();
    }

    private static String first(Map<String, String> f, String... keys) {
        for (String k : keys) {
            String v = f.get(k);
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
