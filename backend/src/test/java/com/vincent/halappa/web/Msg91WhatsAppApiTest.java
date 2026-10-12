package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.vincent.halappa.domain.CampaignRepository;
import com.vincent.halappa.domain.MessageRepository;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.net.InetSocketAddress;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Bulk WhatsApp sent through MSG91 (WHATSAPP_PROVIDER=msg91) against a fake MSG91 server. */
@SpringBootTest(properties = {
        "spring.data.mongodb.database=halappa-msg91",
        "app.uploads-dir=target/test-uploads",
        "app.seed.admin-password=Test@12345",
        "whatsapp.provider=msg91",
        "whatsapp.msg91.integrated-number=919900123406",
        "sms.msg91.auth-key=AUTH",
        "app.campaign.whatsapp-delay-ms=0",
})
@AutoConfigureMockMvc
@DisplayName("Bulk WhatsApp through MSG91")
class Msg91WhatsAppApiTest {

    static final HttpServer SERVER;
    static final List<JsonNode> CALLS = new CopyOnWriteArrayList<>();
    static final AtomicInteger IDS = new AtomicInteger();
    static final ObjectMapper M = new ObjectMapper();

    static {
        try {
            SERVER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            SERVER.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4));
            SERVER.createContext("/api/v5/whatsapp/whatsapp-outbound-message/bulk/", ex -> {
                JsonNode body = M.readTree(ex.getRequestBody());
                byte[] out;
                if (!"AUTH".equals(ex.getRequestHeaders().getFirst("authkey")))
                    out = "{\"status\":\"fail\",\"hasError\":true,\"errors\":\"Invalid authkey\"}".getBytes();
                else if (body.path("payload").path("template").path("to_and_components").get(0).path("to").get(0).asText().endsWith("0000"))
                    out = "{\"status\":\"fail\",\"hasError\":true,\"errors\":\"Number is not on WhatsApp\"}".getBytes();
                else {
                    CALLS.add(body);
                    out = ("{\"status\":\"success\",\"hasError\":false,\"request_id\":\"msg91-" + IDS.incrementAndGet() + "\"}").getBytes();
                }
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, out.length);
                ex.getResponseBody().write(out);
                ex.close();
            });
            SERVER.start();
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void urls(DynamicPropertyRegistry r) {
        r.add("whatsapp.msg91.base-url", () -> "http://127.0.0.1:" + SERVER.getAddress().getPort());
    }

    @AfterAll
    static void stop() { SERVER.stop(0); }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MessageRepository messages;
    @Autowired CampaignRepository campaigns;
    static String token;

    @BeforeEach
    void setUp() throws Exception {
        messages.deleteAll();
        campaigns.deleteAll();
        CALLS.clear();
        if (token == null) {
            String res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"admin\",\"password\":\"Test@12345\"}")).andReturn().getResponse().getContentAsString();
            token = json.readTree(res).get("token").asText();
        }
    }

    private RequestPostProcessor admin() { return r -> { r.addHeader("Authorization", "Bearer " + token); return r; }; }

    private JsonNode waitUntilFinished(long id) throws Exception {
        for (int i = 0; i < 600; i++) {
            JsonNode v = json.readTree(mvc.perform(get("/api/admin/campaigns/" + id).with(admin())).andReturn().getResponse().getContentAsString());
            if (!"running".equals(v.path("campaign").path("status").asText())) return v;
            Thread.sleep(50);
        }
        throw new AssertionError("Campaign did not finish in time");
    }

    @Test
    void channelsShowWhatsAppConnectedThroughMsg91() throws Exception {
        mvc.perform(get("/api/admin/campaigns/channels").with(admin()))
                .andExpect(jsonPath("$.whatsappApi").value(true))
                .andExpect(jsonPath("$.whatsappProvider").value("msg91"))
                .andExpect(jsonPath("$.whatsappTemplatesOnly").value(true))
                .andExpect(jsonPath("$.whatsappInbound").value(false));
    }

    @Test
    void sendsInvitesWithNameAndVoucherThroughMsg91() throws Exception {
        List<Map<String, Object>> people = new ArrayList<>();
        for (int i = 0; i < 300; i++) people.add(Map.of("name", "Person " + i, "phone", "98450" + String.format("%05d", i + 1)));
        Map<String, Object> r = new HashMap<>();
        r.put("name", "Kit distribution via MSG91");
        r.put("channel", "whatsapp");
        r.put("people", people);
        r.put("message", "Namaskara {name}, voucher {voucher}");
        r.put("template", "kit_invite");
        r.put("templateLang", "kn");
        r.put("voucher", Map.of("mode", "auto", "prefix", "KIT-", "start", 1, "digits", 4));
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(r))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode c = json.readTree(res);
        assertThat(c.path("campaign").path("mode").asText()).isEqualTo("api");

        JsonNode done = waitUntilFinished(c.path("campaign").path("id").asLong());
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(300);
        assertThat(done.path("stats").path("failed").asInt()).isZero();
        assertThat(CALLS).hasSize(300);

        JsonNode first = CALLS.stream().filter(b -> b.path("payload").path("template").path("to_and_components").get(0)
                .path("to").get(0).asText().equals("919845000001")).findFirst().orElseThrow();
        assertThat(first.path("integrated_number").asText()).isEqualTo("919900123406");
        JsonNode t = first.path("payload").path("template");
        assertThat(t.path("name").asText()).isEqualTo("kit_invite");
        assertThat(t.path("language").path("code").asText()).isEqualTo("kn");
        JsonNode comp = t.path("to_and_components").get(0).path("components");
        assertThat(comp.path("body_1").path("value").asText()).isEqualTo("Person 0");
        assertThat(comp.path("body_2").path("value").asText()).isEqualTo("KIT-0001");
        // MSG91's request id is kept on each message
        mvc.perform(get("/api/admin/campaigns/" + c.path("campaign").path("id").asLong() + "/recipients").with(admin()))
                .andExpect(jsonPath("$.items[0].providerId", containsString("msg91-")));
    }

    @Test
    void msg91ErrorsAreRecordedPerPerson() throws Exception {
        Map<String, Object> r = Map.of("name", "Partly failing", "channel", "whatsapp", "template", "kit_invite", "message", "Hi {name}",
                "people", List.of(Map.of("name", "A", "phone", "9845010000"), Map.of("name", "B", "phone", "9845012345")));
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(r))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = json.readTree(res).path("campaign").path("id").asLong();
        JsonNode done = waitUntilFinished(id);
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(1);
        assertThat(done.path("stats").path("failed").asInt()).isEqualTo(1);
        mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin()).param("status", "failed"))
                .andExpect(jsonPath("$.items[0].error", containsString("Number is not on WhatsApp")));
    }

    @Test
    void automaticSendWithoutATemplateIsRefused() throws Exception {
        Map<String, Object> r = Map.of("name", "No template", "channel", "whatsapp", "message", "Hello {name}",
                "people", List.of(Map.of("name", "A", "phone", "9845012345")));
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(r)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("MSG91 needs an approved template")));
        assertThat(CALLS).isEmpty();
    }

    @Test
    void manualLinksStillWorkWithoutATemplate() throws Exception {
        Map<String, Object> r = Map.of("name", "By hand", "channel", "whatsapp", "message", "Hello {name}", "manual", true,
                "people", List.of(Map.of("name", "A", "phone", "9845012345")));
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(r)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.campaign.mode").value("manual"));
        assertThat(CALLS).isEmpty();
    }

    @Test
    void inboxRepliesBecomeWhatsAppLinksBecauseMsg91NeedsTemplates() throws Exception {
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("channel", "whatsapp", "contact", "919845012345", "text", "Thank you"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.link").value("https://wa.me/919845012345?text=Thank%20you"))
                .andExpect(jsonPath("$.message.status").value("manual"));
        assertThat(CALLS).isEmpty();
    }
}
