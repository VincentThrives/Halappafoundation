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
        "whatsapp.msg91.webhook-token=hook-secret",
        "app.campaign.whatsapp-delay-ms=0",
})
@AutoConfigureMockMvc
@DisplayName("Bulk WhatsApp through MSG91")
class Msg91WhatsAppApiTest {

    static final HttpServer SERVER;
    static final List<JsonNode> CALLS = new CopyOnWriteArrayList<>();
    static final List<JsonNode> TEXTS = new CopyOnWriteArrayList<>();
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
            // Template list (MSG91 "Get Templates"): one name with an approved and a rejected language, components as a JSON string.
            SERVER.createContext("/api/v5/whatsapp/get-template-client/919900123406", ex -> {
                String json = "{\"status\":\"success\",\"hasError\":false,\"data\":["
                        + "{\"name\":\"kit_invite\",\"languages\":["
                        + "{\"language\":\"kn\",\"status\":\"APPROVED\",\"code\":\"[{\\\"type\\\":\\\"BODY\\\",\\\"text\\\":\\\"Namaskara {{1}}, kit distribution on {{3}}. Voucher: {{2}}\\\"}]\"},"
                        + "{\"language\":\"en\",\"status\":\"REJECTED\",\"code\":[{\"type\":\"BODY\",\"text\":\"rejected\"}]}]},"
                        + "{\"name\":\"thank_you\",\"language\":\"en\",\"status\":\"APPROVED\",\"components\":[{\"type\":\"HEADER\",\"text\":\"Halappa Foundation\"},{\"type\":\"BODY\",\"text\":\"Thank you {{1}}\"}]},"
                        + "{\"name\":\"pending_one\",\"language\":\"en\",\"status\":\"PENDING\",\"components\":[{\"type\":\"BODY\",\"text\":\"x\"}]}]}";
                byte[] out = "AUTH".equals(ex.getRequestHeaders().getFirst("authkey")) ? json.getBytes(java.nio.charset.StandardCharsets.UTF_8)
                        : "{\"status\":\"fail\",\"hasError\":true,\"errors\":\"Invalid authkey\"}".getBytes();
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, out.length);
                ex.getResponseBody().write(out);
                ex.close();
            });
            // Session (free-text) messages: only accepted within 24h; numbers ending 9999 have no open window.
            SERVER.createContext("/api/v5/whatsapp/whatsapp-outbound-message/", ex -> {
                JsonNode body = M.readTree(ex.getRequestBody());
                byte[] out;
                if (body.path("recipient_number").asText().endsWith("9999"))
                    out = "{\"status\":\"fail\",\"hasError\":true,\"errors\":\"Customer care window closed (24 hours)\"}".getBytes();
                else {
                    TEXTS.add(body);
                    out = ("{\"status\":\"success\",\"hasError\":false,\"request_id\":\"txt-" + IDS.incrementAndGet() + "\"}").getBytes();
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
        r.add("whatsapp.msg91.control-url", () -> "http://127.0.0.1:" + SERVER.getAddress().getPort());
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
        TEXTS.clear();
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
                .andExpect(jsonPath("$.whatsappInbound").value(true)); // webhook token is set
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

    // ---------- templates: pick, see the full text, fill in the blanks ----------

    @Test
    void listsOnlyApprovedTemplatesWithTheirFullText() throws Exception {
        String res = mvc.perform(get("/api/admin/campaigns/whatsapp-templates").with(admin()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        JsonNode r = json.readTree(res);
        assertThat(r.path("available").asBoolean()).isTrue();
        JsonNode list = r.path("templates");
        assertThat(list).hasSize(2); // rejected and pending left out
        assertThat(list.get(0).path("name").asText()).isEqualTo("kit_invite");
        assertThat(list.get(0).path("language").asText()).isEqualTo("kn");
        assertThat(list.get(0).path("body").asText()).isEqualTo("Namaskara {{1}}, kit distribution on {{3}}. Voucher: {{2}}");
        assertThat(list.get(0).path("variables").asInt()).isEqualTo(3);
        assertThat(list.get(1).path("name").asText()).isEqualTo("thank_you");
        assertThat(list.get(1).path("body").asText()).isEqualTo("Thank you {{1}}"); // BODY, not the header
        assertThat(list.get(1).path("header").asText()).isEqualTo("TEXT");          // it has a text header…
        assertThat(list.get(0).path("header").isNull()).isTrue();                    // …kit_invite has none
        assertThat(list.get(1).path("variables").asInt()).isEqualTo(1);
    }

    @Test
    void editedBlanksAreSentToMsg91AndTheLogShowsTheExactText() throws Exception {
        Map<String, Object> r = new HashMap<>();
        r.put("name", "Kit with date");
        r.put("channel", "whatsapp");
        r.put("template", "kit_invite");
        r.put("templateLang", "kn");
        r.put("templateBody", "Namaskara {{1}}, kit distribution on {{3}}. Voucher: {{2}}");
        r.put("templateParams", List.of("Sri {name}", "{voucher}", "Sunday 20 Oct, Madhugiri"));
        r.put("voucher", Map.of("mode", "auto", "prefix", "KIT-", "start", 1, "digits", 4));
        r.put("people", List.of(Map.of("name", "Ramesh", "phone", "9845012345"), Map.of("name", "", "phone", "9845012346")));
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(r))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = json.readTree(res).path("campaign").path("id").asLong();
        waitUntilFinished(id);

        JsonNode first = CALLS.stream().filter(b -> b.path("payload").path("template").path("to_and_components").get(0)
                .path("to").get(0).asText().equals("919845012345")).findFirst().orElseThrow();
        JsonNode comp = first.path("payload").path("template").path("to_and_components").get(0).path("components");
        assertThat(comp.path("body_1").path("value").asText()).isEqualTo("Sri Ramesh");
        assertThat(comp.path("body_2").path("value").asText()).isEqualTo("KIT-0001");
        assertThat(comp.path("body_3").path("value").asText()).isEqualTo("Sunday 20 Oct, Madhugiri");
        // a person without a name gets "Friend" (WhatsApp refuses empty values)
        JsonNode second = CALLS.stream().filter(b -> b.path("payload").path("template").path("to_and_components").get(0)
                .path("to").get(0).asText().equals("919845012346")).findFirst().orElseThrow();
        assertThat(second.path("payload").path("template").path("to_and_components").get(0).path("components").path("body_1").path("value").asText())
                .isEqualTo("Sri Friend");

        // The send's log shows exactly what each person received
        mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin()).param("q", "9845012345"))
                .andExpect(jsonPath("$.items[0].body").value("Namaskara Sri Ramesh, kit distribution on Sunday 20 Oct, Madhugiri. Voucher: KIT-0001"));
    }

    // ---------- photo header ----------

    private String uploadPhoto(String type, byte[] bytes, int expectStatus) throws Exception {
        var file = new org.springframework.mock.web.MockMultipartFile("file", "event." + (type.endsWith("png") ? "png" : "jpg"), type, bytes);
        return mvc.perform(multipart("/api/admin/campaigns/header-image").file(file).with(admin()))
                .andExpect(status().is(expectStatus)).andReturn().getResponse().getContentAsString();
    }

    @Test
    void headerPhotoUploadGivesAPublicLinkAndOnlyAcceptsJpgOrPngUpTo5Mb() throws Exception {
        JsonNode r = json.readTree(uploadPhoto("image/jpeg", new byte[] { (byte) 0xFF, (byte) 0xD8, 1, 2, 3 }, 200));
        assertThat(r.path("path").asText()).startsWith("/uploads/").endsWith(".jpg");
        assertThat(r.path("url").asText()).startsWith("http://localhost").endsWith(r.path("path").asText()); // full public link
        assertThat(json.readTree(uploadPhoto("image/png", new byte[] { 1, 2 }, 200)).path("path").asText()).endsWith(".png");

        assertThat(uploadPhoto("image/gif", new byte[] { 1 }, 400)).contains("JPG or PNG");
        assertThat(uploadPhoto("image/jpeg", new byte[5 * 1024 * 1024 + 1], 400)).contains("5 MB");
        mvc.perform(multipart("/api/admin/campaigns/header-image")
                .file(new org.springframework.mock.web.MockMultipartFile("file", "x.jpg", "image/jpeg", new byte[] { 1 })))
                .andExpect(status().isUnauthorized()); // admins only
    }

    @Test
    void photoTemplateNeedsAPhotoAndEveryMessageCarriesIt() throws Exception {
        Map<String, Object> r = new HashMap<>(Map.of("name", "Event update", "channel", "whatsapp", "template", "event_update",
                "templateLang", "kn", "templateHeader", "IMAGE", "templateBody", "Today {{1}}, thanks {{2}}",
                "templateParams", List.of("12-10-2026", "{name}"),
                "people", List.of(Map.of("name", "Asha", "phone", "9845012345"), Map.of("name", "Ravi", "phone", "9845012346"))));
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(r)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("upload the photo")));
        r.put("headerImage", "not a link");
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(r)))
                .andExpect(status().isBadRequest());
        assertThat(campaigns.count()).isZero();

        r.put("headerImage", "https://halappa.example/uploads/event.jpg");
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(r)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        waitUntilFinished(json.readTree(res).path("campaign").path("id").asLong());
        assertThat(CALLS).hasSize(2);
        for (JsonNode call : CALLS) {
            JsonNode comp = call.path("payload").path("template").path("to_and_components").get(0).path("components");
            assertThat(comp.path("header_1").path("value").asText()).isEqualTo("https://halappa.example/uploads/event.jpg");
            assertThat(comp.path("body_1").path("value").asText()).isEqualTo("12-10-2026");
        }
    }

    @Test
    void aBlankLeftEmptyIsRefusedBeforeAnythingIsSent() throws Exception {
        Map<String, Object> r = Map.of("name", "Missing date", "channel", "whatsapp", "template", "kit_invite",
                "templateBody", "Namaskara {{1}}, kit distribution on {{3}}. Voucher: {{2}}",
                "templateParams", List.of("{name}", "{voucher}", " "),
                "people", List.of(Map.of("name", "A", "phone", "9845012345")));
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(r)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Fill in {{3}} of the template"));
        assertThat(campaigns.count()).isZero();
        assertThat(CALLS).isEmpty();
    }

    // ---------- webhook: replies, delivery status, replying from the website ----------

    private void webhook(String body) throws Exception {
        mvc.perform(post("/api/webhooks/msg91-whatsapp").param("token", "hook-secret")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
    }

    private JsonNode thread(String contact) throws Exception {
        return json.readTree(mvc.perform(get("/api/admin/inbox/thread").with(admin()).param("channel", "whatsapp").param("contact", contact))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void fullConversationSentInviteDeliveryReadReplyAndAnswerFromTheWebsite() throws Exception {
        // 1) the invite goes out through MSG91
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "Kit invite", "channel", "whatsapp", "template", "kit_invite",
                        "message", "Namaskara {name}", "people", List.of(Map.of("name", "Ramesh", "phone", "9845012345"))))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        waitUntilFinished(json.readTree(res).path("campaign").path("id").asLong());
        String requestId = messages.findAll().stream().filter(m -> "out".equals(m.getDirection())).findFirst().orElseThrow().getProviderId();

        // 2) MSG91 reports delivered, then read (stringified-JSON content is fine)
        webhook("{\"direction\":\"outbound\",\"status\":\"Delivered\",\"request_id\":\"" + requestId + "\",\"customer_number\":\"919845012345\",\"content\":\"{}\"}");
        webhook("[{\"direction\":\"outbound\",\"status\":\"Read\",\"request_id\":\"" + requestId + "\",\"customer_number\":\"919845012345\"}]");

        // 3) the person replies on WhatsApp
        String reply = "{\"direction\":\"inbound\",\"customer_number\":\"919845012345\",\"customer_name\":\"Ramesh K\",\"message_type\":\"text\","
                + "\"message_uuid\":\"in-1\",\"integrated_number\":\"919900123406\",\"content\":\"{\\\"text\\\":\\\"Yes, I will come. ಧನ್ಯವಾದ\\\"}\"}";
        webhook(reply);
        webhook(reply); // MSG91 retries: not saved twice

        // The reply waits as unread in the Inbox (badge) until the admin opens the conversation
        mvc.perform(get("/api/admin/inbox/unread").with(admin())).andExpect(jsonPath("$.unread").value(1));

        // 4) admin answers from the website (free text inside the 24h window)
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("channel", "whatsapp", "contact", "919845012345", "text", "See you on Sunday"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message.status").value("sent"))
                .andExpect(jsonPath("$.link").doesNotExist());
        assertThat(TEXTS).hasSize(1);
        assertThat(TEXTS.get(0).path("recipient_number").asText()).isEqualTo("919845012345");
        assertThat(TEXTS.get(0).path("text").asText()).isEqualTo("See you on Sunday");

        // One conversation, in order: invite (read) → their reply → our answer (opening it marks it read)
        JsonNode t = thread("919845012345");
        assertThat(t).hasSize(3);
        assertThat(t.get(0).path("direction").asText()).isEqualTo("out");
        assertThat(t.get(0).path("status").asText()).isEqualTo("read");
        assertThat(t.get(1).path("direction").asText()).isEqualTo("in");
        assertThat(t.get(1).path("body").asText()).isEqualTo("Yes, I will come. ಧನ್ಯವಾದ");
        assertThat(t.get(1).path("name").asText()).isEqualTo("Ramesh K");
        assertThat(t.get(2).path("direction").asText()).isEqualTo("out");
        assertThat(t.get(2).path("body").asText()).isEqualTo("See you on Sunday");

    }

    @Test
    void readsRepliesInTheDifferentShapesMsg91Uses() throws Exception {
        webhook("{\"direction\":\"inbound\",\"customer_number\":\"919845011111\",\"uuid\":\"a1\",\"text\":\"plain text field\"}");
        webhook("{\"data\":[{\"direction\":\"inbound\",\"customerNumber\":\"9845022222\",\"uuid\":\"a2\",\"content\":{\"text\":{\"body\":\"nested body\"}}}]}");
        webhook("{\"direction\":\"inbound\",\"customer_number\":\"919845033333\",\"uuid\":\"a3\",\"messages\":\"[{\\\"type\\\":\\\"button\\\",\\\"button\\\":{\\\"text\\\":\\\"Attending\\\"}}]\"}");
        webhook("{\"direction\":\"inbound\",\"customer_number\":\"919845044444\",\"uuid\":\"a4\",\"message_type\":\"image\",\"content\":\"{}\"}");

        assertThat(thread("919845011111").get(0).path("body").asText()).isEqualTo("plain text field");
        assertThat(thread("919845022222").get(0).path("body").asText()).isEqualTo("nested body");
        assertThat(thread("919845033333").get(0).path("body").asText()).isEqualTo("Attending");
        assertThat(thread("919845044444").get(0).path("body").asText()).isEqualTo("[image]");
    }

    @Test
    void failedDeliveryShowsTheReason() throws Exception {
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "One", "channel", "whatsapp", "template", "kit_invite", "message", "Hi",
                        "people", List.of(Map.of("name", "A", "phone", "9845055555"))))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = json.readTree(res).path("campaign").path("id").asLong();
        waitUntilFinished(id);
        String requestId = messages.findAll().get(0).getProviderId();
        webhook("{\"direction\":\"outbound\",\"status\":\"Failed\",\"request_id\":\"" + requestId + "\",\"failure_reason\":\"User is not on WhatsApp\"}");
        mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin()).param("status", "failed"))
                .andExpect(jsonPath("$.items[0].error").value("User is not on WhatsApp"));
    }

    @Test
    void webhookNeedsTheSecretToken() throws Exception {
        String body = "{\"direction\":\"inbound\",\"customer_number\":\"919845066666\",\"uuid\":\"x\",\"text\":\"spoof\"}";
        mvc.perform(post("/api/webhooks/msg91-whatsapp").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/webhooks/msg91-whatsapp").param("token", "wrong").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        assertThat(messages.count()).isZero();
        // Junk is answered 200 (so MSG91 doesn't retry forever) and ignored
        webhook("not json");
        assertThat(messages.count()).isZero();
    }

    @Test
    void replyOutsideTheTwentyFourHourWindowExplainsWhy() throws Exception {
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("channel", "whatsapp", "contact", "919845019999", "text", "Hello"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("24-hour")))
                .andExpect(jsonPath("$.message", containsString("window closed")));
        // Kept in the conversation as failed, so it isn't silently lost
        assertThat(thread("919845019999").get(0).path("status").asText()).isEqualTo("failed");
    }
}
