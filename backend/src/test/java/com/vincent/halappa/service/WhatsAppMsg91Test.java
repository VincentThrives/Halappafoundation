package com.vincent.halappa.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** WhatsApp through MSG91: request format, success/failure handling, and when it counts as connected. */
class WhatsAppMsg91Test {
    private HttpServer server;
    private String base;
    private final AtomicReference<String> path = new AtomicReference<>();
    private final AtomicReference<String> authKey = new AtomicReference<>();
    private final AtomicReference<JsonNode> body = new AtomicReference<>();
    private volatile int status = 200;
    private volatile String reply = "{\"status\":\"success\",\"hasError\":false,\"data\":\"Request accepted\",\"request_id\":\"req-123\"}";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            path.set(ex.getRequestURI().getPath());
            authKey.set(ex.getRequestHeaders().getFirst("authkey"));
            body.set(new ObjectMapper().readTree(ex.getRequestBody().readAllBytes()));
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() { server.stop(0); }

    private WhatsAppService msg91(String key, String number, String namespace) {
        return new WhatsAppService("msg91", "", "", "v21.0", "https://graph.facebook.com", key, number, namespace, base, base);
    }

    @Test
    void connectedOnlyWithAuthKeyAndNumber() {
        assertThat(msg91("", "", "").apiEnabled()).isFalse();
        assertThat(msg91("KEY", "", "").apiEnabled()).isFalse();
        assertThat(msg91("", "919900123406", "").apiEnabled()).isFalse();
        WhatsAppService ok = msg91("KEY", "919900123406", "");
        assertThat(ok.apiEnabled()).isTrue();
        assertThat(ok.provider()).isEqualTo("msg91");
        assertThat(ok.bulkNeedsTemplate()).isTrue();
        // Meta stays the default and still allows free text
        WhatsAppService meta = new WhatsAppService("token", "123", "v21.0", base);
        assertThat(meta.provider()).isEqualTo("meta");
        assertThat(meta.bulkNeedsTemplate()).isFalse();
        // Unknown provider names fall back to Meta
        assertThat(new WhatsAppService("other", "t", "1", "v21.0", base, "K", "9199", "", base, base).provider()).isEqualTo("meta");
    }

    @Test
    void sendsTheTemplateWithNameAndVoucherInMsg91Format() {
        String id = msg91("KEY", "+91 99001 23406", "ns-1").send("919876543210", "ignored", "kit_invite", "kn", List.of("Ramesh", "KIT-2026-0001"));

        assertThat(id).isEqualTo("req-123");
        assertThat(path.get()).isEqualTo("/api/v5/whatsapp/whatsapp-outbound-message/bulk/");
        assertThat(authKey.get()).isEqualTo("KEY");
        JsonNode b = body.get();
        assertThat(b.path("integrated_number").asText()).isEqualTo("919900123406"); // cleaned up
        assertThat(b.path("content_type").asText()).isEqualTo("template");
        JsonNode p = b.path("payload");
        assertThat(p.path("messaging_product").asText()).isEqualTo("whatsapp");
        assertThat(p.path("type").asText()).isEqualTo("template");
        JsonNode t = p.path("template");
        assertThat(t.path("name").asText()).isEqualTo("kit_invite");
        assertThat(t.path("language").path("code").asText()).isEqualTo("kn");
        assertThat(t.path("language").path("policy").asText()).isEqualTo("deterministic");
        assertThat(t.path("namespace").asText()).isEqualTo("ns-1");
        JsonNode to = t.path("to_and_components").get(0);
        assertThat(to.path("to").get(0).asText()).isEqualTo("919876543210");
        assertThat(to.path("components").path("body_1").path("value").asText()).isEqualTo("Ramesh");
        assertThat(to.path("components").path("body_1").path("type").asText()).isEqualTo("text");
        assertThat(to.path("components").path("body_2").path("value").asText()).isEqualTo("KIT-2026-0001");
    }

    @Test
    void namespaceIsLeftOutWhenNotSetAndLanguageDefaultsToEnglish() {
        msg91("KEY", "919900123406", "").send("919876543210", null, "kit_invite", null, List.of("Asha"));
        JsonNode t = body.get().path("payload").path("template");
        assertThat(t.has("namespace")).isFalse();
        assertThat(t.path("language").path("code").asText()).isEqualTo("en");
        assertThat(t.path("to_and_components").get(0).path("components").has("body_2")).isFalse();
    }

    @Test
    void freeTextRepliesGoAsMsg91SessionMessages() {
        String id = msg91("KEY", "919900123406", "").send("919876543210", "Thank you, see you at the event", null, null, null);

        assertThat(id).isEqualTo("req-123");
        assertThat(path.get()).isEqualTo("/api/v5/whatsapp/whatsapp-outbound-message/"); // not the bulk template path
        assertThat(authKey.get()).isEqualTo("KEY");
        JsonNode b = body.get();
        assertThat(b.path("integrated_number").asText()).isEqualTo("919900123406");
        assertThat(b.path("recipient_number").asText()).isEqualTo("919876543210");
        assertThat(b.path("content_type").asText()).isEqualTo("text");
        assertThat(b.path("text").asText()).isEqualTo("Thank you, see you at the event");
        assertThat(b.has("payload")).isFalse();
    }

    @Test
    void emptyFreeTextIsNotSent() {
        assertThatThrownBy(() -> msg91("KEY", "919900123406", "").send("919876543210", "  ", null, "en", List.of()))
                .isInstanceOf(IllegalStateException.class);
        assertThat(path.get()).isNull(); // nothing was sent
    }

    @Test
    void reportsMsg91ErrorsInTheResponseBody() {
        reply = "{\"status\":\"fail\",\"hasError\":true,\"errors\":\"Template kit_invite not found\"}";
        assertThatThrownBy(() -> msg91("KEY", "919900123406", "").send("919876543210", null, "kit_invite", "en", List.of("A")))
                .hasMessageContaining("MSG91").hasMessageContaining("Template kit_invite not found");
    }

    @Test
    void reportsHttpErrors() {
        status = 401;
        reply = "{\"message\":\"Unauthorized authkey\"}";
        assertThatThrownBy(() -> msg91("BAD", "919900123406", "").send("919876543210", null, "kit_invite", "en", List.of("A")))
                .hasMessageContaining("MSG91").hasMessageContaining("Unauthorized authkey");
    }
}
