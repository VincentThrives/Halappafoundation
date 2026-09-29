package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.vincent.halappa.domain.CampaignRepository;
import com.vincent.halappa.domain.MessageRepository;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Runs the real sending code against a fake WhatsApp (Meta) and SMS (MSG91) server, with a mocked SMTP
 * sender: 5000-message sends, delivery receipts, replies, failures and retries, incoming messages.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:halappa-providers;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "app.uploads-dir=target/test-uploads",
        "app.seed.admin-password=Test@12345",
        "whatsapp.token=test-token",
        "whatsapp.phone-number-id=PHONE1",
        "whatsapp.verify-token=verify-me",
        "whatsapp.app-secret=app-secret",
        "sms.provider=msg91",
        "sms.msg91.auth-key=AUTH",
        "sms.msg91.flow-id=FLOW1",
        "sms.inbound-token=sms-secret",
        "spring.mail.host=smtp.test",
        "app.mail.from=info@halappafoundation.org",
        "app.campaign.whatsapp-delay-ms=0",
        "app.campaign.email-delay-ms=0",
})
@AutoConfigureMockMvc
@DisplayName("Bulk messages with WhatsApp, SMS and email connected")
class ProvidersApiTest {

    // ---------- fake provider ----------
    static final HttpServer SERVER;
    static final List<JsonNode> WHATSAPP_CALLS = new CopyOnWriteArrayList<>();
    static final List<JsonNode> SMS_CALLS = new CopyOnWriteArrayList<>();
    static final AtomicBoolean FAIL_ENDING_0000 = new AtomicBoolean(false);
    static final AtomicInteger IDS = new AtomicInteger();
    static final ObjectMapper M = new ObjectMapper();

    static {
        try {
            SERVER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            SERVER.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4));
            SERVER.createContext("/v21.0/PHONE1/messages", ex -> {
                JsonNode body = M.readTree(ex.getRequestBody());
                boolean authOk = "Bearer test-token".equals(ex.getRequestHeaders().getFirst("Authorization"));
                String to = body.path("to").asText();
                byte[] out;
                int code;
                if (!authOk || (FAIL_ENDING_0000.get() && to.endsWith("0000"))) {
                    code = 400;
                    out = "{\"error\":{\"message\":\"(#131026) Message undeliverable\"}}".getBytes();
                } else {
                    WHATSAPP_CALLS.add(body);
                    code = 200;
                    out = ("{\"messages\":[{\"id\":\"wamid." + IDS.incrementAndGet() + "\"}]}").getBytes();
                }
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(code, out.length);
                ex.getResponseBody().write(out);
                ex.close();
            });
            SERVER.createContext("/api/v5/flow", ex -> {
                JsonNode body = M.readTree(ex.getRequestBody());
                byte[] out;
                if ("AUTH".equals(ex.getRequestHeaders().getFirst("authkey"))) {
                    SMS_CALLS.add(body);
                    out = ("{\"type\":\"success\",\"message\":\"req-" + IDS.incrementAndGet() + "\"}").getBytes();
                } else out = "{\"type\":\"error\",\"message\":\"bad key\"}".getBytes();
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
        String base = "http://127.0.0.1:" + SERVER.getAddress().getPort();
        r.add("whatsapp.base-url", () -> base);
        r.add("sms.msg91.base-url", () -> base);
    }

    @AfterAll
    static void stop() { SERVER.stop(0); }

    // ---------- test plumbing ----------
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MessageRepository messages;
    @Autowired CampaignRepository campaigns;
    @MockBean JavaMailSender smtp;
    static String token; // one login for the whole class (the login limiter allows 10 per 15 min)

    @BeforeEach
    void setUp() throws Exception {
        messages.deleteAll();
        campaigns.deleteAll();
        WHATSAPP_CALLS.clear();
        SMS_CALLS.clear();
        FAIL_ENDING_0000.set(false);
        reset(smtp);
        when(smtp.createMimeMessage()).thenAnswer(i -> new MimeMessage(Session.getInstance(new Properties())));
        doAnswer(i -> { ((MimeMessage) i.getArgument(0)).saveChanges(); return null; }).when(smtp).send(any(MimeMessage.class));
        if (token == null) {
            String res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"admin\",\"password\":\"Test@12345\"}")).andReturn().getResponse().getContentAsString();
            token = json.readTree(res).get("token").asText();
        }
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor admin() {
        return r -> { r.addHeader("Authorization", "Bearer " + token); return r; };
    }

    private JsonNode createCampaign(Map<String, Object> body) throws Exception {
        String res = mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(res);
    }

    private JsonNode waitUntilFinished(long id) throws Exception {
        for (int i = 0; i < 600; i++) {
            JsonNode v = json.readTree(mvc.perform(get("/api/admin/campaigns/" + id).with(admin())).andReturn().getResponse().getContentAsString());
            if (!"running".equals(v.path("campaign").path("status").asText())) return v;
            Thread.sleep(100);
        }
        throw new AssertionError("Campaign did not finish in time");
    }

    private static List<Map<String, Object>> people(int n, String prefix) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(new HashMap<>(Map.of("name", "Person " + i, "phone", prefix + String.format("%05d", i))));
        return out;
    }

    private String sign(String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("app-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    private void webhook(String body) throws Exception {
        mvc.perform(post("/api/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON).content(body)
                .header("X-Hub-Signature-256", sign(body))).andExpect(status().isOk());
    }

    // ---------- WhatsApp ----------

    @Test
    void sends5000WhatsAppInvitesWithTemplateAndVouchers() throws Exception {
        Map<String, Object> r = new HashMap<>();
        r.put("name", "Kit distribution");
        r.put("channel", "whatsapp");
        r.put("people", people(5000, "98450"));
        r.put("message", "Namaskara {name}, voucher {voucher}");
        r.put("template", "kit_invite");
        r.put("templateLang", "kn");
        r.put("voucher", Map.of("mode", "auto", "prefix", "KIT-", "start", 1, "digits", 4));
        JsonNode c = createCampaign(r);
        assertThat(c.path("campaign").path("mode").asText()).isEqualTo("api");

        JsonNode done = waitUntilFinished(c.path("campaign").path("id").asLong());
        assertThat(done.path("campaign").path("status").asText()).isEqualTo("done");
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(5000);
        assertThat(done.path("stats").path("failed").asInt()).isZero();
        assertThat(WHATSAPP_CALLS).hasSize(5000);

        JsonNode first = WHATSAPP_CALLS.stream().filter(b -> b.path("to").asText().equals("919845000000")).findFirst().orElseThrow();
        assertThat(first.path("type").asText()).isEqualTo("template");
        assertThat(first.path("template").path("name").asText()).isEqualTo("kit_invite");
        assertThat(first.path("template").path("language").path("code").asText()).isEqualTo("kn");
        JsonNode params = first.path("template").path("components").get(0).path("parameters");
        assertThat(params.get(0).path("text").asText()).isEqualTo("Person 0");
        assertThat(params.get(1).path("text").asText()).isEqualTo("KIT-0001");
    }

    @Test
    void failuresAreRecordedAndCanBeRetried() throws Exception {
        FAIL_ENDING_0000.set(true);
        JsonNode c = createCampaign(Map.of("name", "Retry test", "channel", "whatsapp", "message", "Hi {name}",
                "people", List.of(Map.of("name", "A", "phone", "9845010000"), Map.of("name", "B", "phone", "9845012345"))));
        long id = c.path("campaign").path("id").asLong();
        JsonNode done = waitUntilFinished(id);
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(1);
        assertThat(done.path("stats").path("failed").asInt()).isEqualTo(1);
        mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin()).param("status", "failed"))
                .andExpect(jsonPath("$.items[0].error", containsString("undeliverable")));

        FAIL_ENDING_0000.set(false);
        mvc.perform(post("/api/admin/campaigns/" + id + "/retry-failed").with(admin())).andExpect(status().isOk());
        done = waitUntilFinished(id);
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(2);
        assertThat(done.path("stats").path("failed").asInt()).isZero();
        mvc.perform(post("/api/admin/campaigns/" + id + "/retry-failed").with(admin()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Nothing failed"));
    }

    @Test
    void pauseResumeAndCancelARunningSend() throws Exception {
        JsonNode c = createCampaign(Map.of("name", "Big", "channel", "whatsapp", "message", "Hi", "people", people(3000, "99000")));
        long id = c.path("campaign").path("id").asLong();
        mvc.perform(post("/api/admin/campaigns/" + id + "/pause").with(admin())).andExpect(jsonPath("$.campaign.status").value("paused"));
        Thread.sleep(1500); // let the runner notice
        int sentWhilePaused = WHATSAPP_CALLS.size();
        Thread.sleep(1000);
        assertThat(WHATSAPP_CALLS.size()).as("nothing more goes out while paused").isEqualTo(sentWhilePaused);
        assertThat(sentWhilePaused).isLessThan(3000);
        mvc.perform(post("/api/admin/campaigns/" + id + "/pause").with(admin())).andExpect(status().isBadRequest());

        mvc.perform(post("/api/admin/campaigns/" + id + "/resume").with(admin())).andExpect(jsonPath("$.campaign.status").value("running"));
        mvc.perform(post("/api/admin/campaigns/" + id + "/cancel").with(admin())).andExpect(jsonPath("$.campaign.status").value("cancelled"));
        Thread.sleep(1500);
        JsonNode v = json.readTree(mvc.perform(get("/api/admin/campaigns/" + id).with(admin())).andReturn().getResponse().getContentAsString());
        long sent = v.path("stats").path("sent").asLong(), cancelled = v.path("stats").path("cancelled").asLong();
        assertThat(sent + cancelled).isEqualTo(3000);
        assertThat(cancelled).isGreaterThan(0);
        assertThat(v.path("stats").path("queued").asLong()).isZero();
        mvc.perform(post("/api/admin/campaigns/" + id + "/resume").with(admin())).andExpect(status().isBadRequest());
    }

    @Test
    void freeTextMessageIsPersonalised() throws Exception {
        JsonNode c = createCampaign(Map.of("name", "Text", "channel", "whatsapp", "message", "Namaskara {name}, voucher {voucher}",
                "people", List.of(Map.of("name", "Ramesh", "phone", "9845012345")),
                "voucher", Map.of("mode", "fixed", "fixed", "ALL-IN")));
        waitUntilFinished(c.path("campaign").path("id").asLong());
        assertThat(WHATSAPP_CALLS.get(0).path("text").path("body").asText()).isEqualTo("Namaskara Ramesh, voucher ALL-IN");
    }

    @Test
    void deliveryAndReadReceiptsUpdateTheCounts() throws Exception {
        JsonNode c = createCampaign(Map.of("name", "Receipts", "channel", "whatsapp", "message", "Hi",
                "people", List.of(Map.of("phone", "9845012345"), Map.of("phone", "9123456789"))));
        long id = c.path("campaign").path("id").asLong();
        waitUntilFinished(id);
        List<String> wamids = messages.findByCampaignIdOrderByIdAsc(id).stream().map(m -> m.getProviderId()).toList();

        webhook(statusPayload(wamids.get(0), "delivered", null));
        webhook(statusPayload(wamids.get(0), "read", null));
        webhook(statusPayload(wamids.get(0), "delivered", null)); // late receipt must not go backwards
        webhook(statusPayload(wamids.get(1), "failed", "{\"code\":131047,\"title\":\"Re-engagement message\",\"error_data\":{\"details\":\"More than 24 hours\"}}"));

        mvc.perform(get("/api/admin/campaigns/" + id).with(admin()))
                .andExpect(jsonPath("$.stats.read").value(1))
                .andExpect(jsonPath("$.stats.delivered").value(1))
                .andExpect(jsonPath("$.stats.failed").value(1));
        mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin()).param("status", "failed"))
                .andExpect(jsonPath("$.items[0].error").value("Re-engagement message More than 24 hours"));
    }

    private static String statusPayload(String wamid, String status, String errorJson) {
        return "{\"entry\":[{\"changes\":[{\"value\":{\"statuses\":[{\"id\":\"" + wamid + "\",\"status\":\"" + status + "\""
                + (errorJson == null ? "" : ",\"errors\":[" + errorJson + "]") + "}]}}]}]}";
    }

    @Test
    void incomingWhatsAppMessagesLandInTheInbox() throws Exception {
        String body = """
                {"entry":[{"changes":[{"value":{
                  "contacts":[{"profile":{"name":"Suresh"},"wa_id":"919845012345"}],
                  "messages":[{"from":"919845012345","id":"wamid.IN1","type":"text","text":{"body":"ನಾನು ಬರುತ್ತೇನೆ, ಧನ್ಯವಾದ"}},
                              {"from":"919845012345","id":"wamid.IN2","type":"button","button":{"text":"Yes, I will attend"}}]}}]}]}
                """;
        webhook(body);
        webhook(body); // Meta retries must not duplicate
        mvc.perform(get("/api/admin/inbox/threads").with(admin()).param("channel", "whatsapp"))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Suresh"))
                .andExpect(jsonPath("$.items[0].unread").value(2))
                .andExpect(jsonPath("$.items[0].lastBody").value("Yes, I will attend"));
        mvc.perform(get("/api/admin/inbox/thread").with(admin()).param("channel", "whatsapp").param("contact", "919845012345"))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].body").value("ನಾನು ಬರುತ್ತೇನೆ, ಧನ್ಯವಾದ"));
        mvc.perform(get("/api/admin/inbox/messages").with(admin()).param("direction", "in").param("q", "attend"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void webhookSignatureAndVerification() throws Exception {
        mvc.perform(get("/api/webhooks/whatsapp").param("hub.mode", "subscribe").param("hub.verify_token", "verify-me").param("hub.challenge", "12345"))
                .andExpect(status().isOk()).andExpect(content().string("12345"));
        mvc.perform(get("/api/webhooks/whatsapp").param("hub.mode", "subscribe").param("hub.verify_token", "wrong").param("hub.challenge", "1"))
                .andExpect(status().isForbidden());
        String body = "{\"entry\":[]}";
        mvc.perform(post("/api/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON).content(body).header("X-Hub-Signature-256", "sha256=deadbeef"))
                .andExpect(status().isForbidden());
    }

    @Test
    void replyToAWhatsAppConversation() throws Exception {
        webhook("{\"entry\":[{\"changes\":[{\"value\":{\"messages\":[{\"from\":\"919845012345\",\"id\":\"wamid.Q\",\"type\":\"text\",\"text\":{\"body\":\"Where is the venue?\"}}]}}]}]}");
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"channel\":\"whatsapp\",\"contact\":\"919845012345\",\"text\":\"Madhugiri community hall, 10 AM\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message.status").value("sent"))
                .andExpect(jsonPath("$.link").doesNotExist());
        assertThat(WHATSAPP_CALLS.get(WHATSAPP_CALLS.size() - 1).path("text").path("body").asText()).isEqualTo("Madhugiri community hall, 10 AM");
        mvc.perform(get("/api/admin/inbox/thread").with(admin()).param("channel", "whatsapp").param("contact", "919845012345"))
                .andExpect(jsonPath("$[*].direction", contains("in", "out")));
    }

    // ---------- SMS ----------

    @Test
    void smsGoesOutInBatchesOf100WithNameAndVoucher() throws Exception {
        JsonNode c = createCampaign(Map.of("name", "SMS invite", "channel", "sms",
                "message", "Dear {name}, your kit voucher is {voucher}. -Halappa Foundation",
                "people", people(250, "91230"), "voucher", Map.of("mode", "auto", "prefix", "S-", "start", 1)));
        JsonNode done = waitUntilFinished(c.path("campaign").path("id").asLong());
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(250);
        assertThat(SMS_CALLS).hasSize(3);
        assertThat(SMS_CALLS).extracting(b -> b.path("recipients").size()).containsExactly(100, 100, 50);
        JsonNode r0 = SMS_CALLS.get(0);
        assertThat(r0.path("template_id").asText()).isEqualTo("FLOW1");
        assertThat(r0.path("recipients").get(0).path("mobiles").asText()).isEqualTo("919123000000");
        assertThat(r0.path("recipients").get(0).path("name").asText()).isEqualTo("Person 0");
        assertThat(r0.path("recipients").get(0).path("voucher").asText()).isEqualTo("S-0001");
    }

    @Test
    void incomingSmsFromJsonOrForm() throws Exception {
        mvc.perform(post("/api/webhooks/sms").param("token", "sms-secret").contentType(MediaType.APPLICATION_JSON)
                .content("{\"sender\":\"919845012345\",\"message\":\"YES\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/webhooks/sms").param("token", "sms-secret").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("mobile", "9123456789").param("text", "Coming")).andExpect(status().isOk());
        mvc.perform(post("/api/webhooks/sms").param("token", "sms-secret").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/inbox/threads").with(admin()).param("channel", "sms"))
                .andExpect(jsonPath("$.total").value(2));
    }

    // ---------- Email ----------

    @Test
    void bulkEmailWithPersonalSubjectAndVoucher() throws Exception {
        JsonNode c = createCampaign(Map.of("name", "Email invite", "channel", "email",
                "subject", "Invitation for {name}", "message", "Dear {name},\nYour entrance voucher: {voucher}",
                "people", List.of(Map.of("name", "Asha", "email", "Asha@Example.com"), Map.of("name", "Bad", "email", "nope")),
                "voucher", Map.of("mode", "auto", "prefix", "E-", "start", 1)));
        JsonNode done = waitUntilFinished(c.path("campaign").path("id").asLong());
        assertThat(done.path("stats").path("total").asInt()).isEqualTo(1);
        assertThat(done.path("stats").path("sent").asInt()).isEqualTo(1);
        var captor = org.mockito.ArgumentCaptor.forClass(MimeMessage.class);
        verify(smtp).send(captor.capture());
        MimeMessage sent = captor.getValue();
        assertThat(sent.getSubject()).isEqualTo("Invitation for Asha");
        assertThat(sent.getAllRecipients()[0].toString()).isEqualTo("asha@example.com");
        assertThat(sent.getContent().toString()).contains("Your entrance voucher: E-0001");
    }

    @Test
    void emailReplyFromInbox() throws Exception {
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"channel\":\"email\",\"contact\":\"a@example.com\",\"subject\":\"Re: venue\",\"text\":\"Community hall\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message.status").value("sent"));
        verify(smtp).send(any(MimeMessage.class));
    }

    @Test
    void contactFormEmailsTheOfficeAndAcknowledgesTheSender() throws Exception {
        String body = "{\"name\":\"Ramesh\",\"phone\":\"9845012345\",\"email\":\"ramesh@example.com\",\"type\":\"request\","
                + "\"subject\":\"Hostel\",\"message\":\"Need hostel details\",\"channel\":\"email\"}";
        mvc.perform(post("/api/public/enquiries").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        var captor = org.mockito.ArgumentCaptor.forClass(MimeMessage.class);
        verify(smtp, timeout(5000).times(2)).send(captor.capture());
        MimeMessage office = captor.getAllValues().get(0), ack = captor.getAllValues().get(1);
        assertThat(office.getSubject()).startsWith("[Halappa Foundation] New request #").endsWith("from Ramesh");
        assertThat(office.getReplyTo()[0].toString()).isEqualTo("ramesh@example.com");
        assertThat(office.getContent().toString()).contains("Need hostel details");
        assertThat(ack.getAllRecipients()[0].toString()).isEqualTo("ramesh@example.com");
        assertThat(ack.getContent().toString()).contains("ನಿಮ್ಮ ಸಂದೇಶ ನಮಗೆ ತಲುಪಿದೆ");
        // The acknowledgement shows up as a sent email in the Inbox.
        for (int i = 0; i < 50 && messages.findByChannelAndContactOrderByIdAsc("email", "ramesh@example.com").isEmpty(); i++) Thread.sleep(100);
        assertThat(messages.findByChannelAndContactOrderByIdAsc("email", "ramesh@example.com"))
                .singleElement().satisfies(m -> assertThat(m.getDirection()).isEqualTo("out"));
    }

    @Test
    void smtpFailureDoesNotLoseTheEnquiry() throws Exception {
        doThrow(new org.springframework.mail.MailSendException("SMTP down")).when(smtp).send(any(MimeMessage.class));
        mvc.perform(post("/api/public/enquiries").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"phone\":\"9845012345\",\"message\":\"Hi\",\"channel\":\"email\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    void failedEmailInABulkSendIsMarkedFailed() throws Exception {
        doThrow(new org.springframework.mail.MailSendException("Mailbox full")).when(smtp).send(any(MimeMessage.class));
        JsonNode c = createCampaign(Map.of("name", "Bad mail", "channel", "email", "subject", "Hi", "message", "Hi",
                "people", List.of(Map.of("email", "x@example.com"))));
        JsonNode done = waitUntilFinished(c.path("campaign").path("id").asLong());
        assertThat(done.path("stats").path("failed").asInt()).isEqualTo(1);
        mvc.perform(get("/api/admin/campaigns/" + c.path("campaign").path("id").asLong() + "/recipients").with(admin()))
                .andExpect(jsonPath("$.items[0].error", containsString("Mailbox full")));
    }

    @Test
    void wrongSmsKeyFailsTheBatchWithTheProviderMessage() throws Exception {
        // Same fake server, but the SMS service is pointed at it with a bad key via a fresh instance.
        var bad = new com.vincent.halappa.service.SmsService("msg91", "WRONG", "FLOW1", "http://127.0.0.1:" + SERVER.getAddress().getPort());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> bad.sendBatch(List.of(new com.vincent.halappa.service.SmsService.Recipient("919845012345", "A", "V1"))))
                .hasMessage("bad key");
    }

    @Test
    void channelsReportConnected() throws Exception {
        mvc.perform(get("/api/admin/campaigns/channels").with(admin()))
                .andExpect(jsonPath("$.whatsappApi").value(true))
                .andExpect(jsonPath("$.whatsappInbound").value(true))
                .andExpect(jsonPath("$.email").value(true))
                .andExpect(jsonPath("$.sms").value(true))
                .andExpect(jsonPath("$.smsInbound").value(true));
    }
}
