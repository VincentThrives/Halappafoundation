package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.vincent.halappa.domain.*;
import com.vincent.halappa.service.WalletService;
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
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Super admin, wallets, prices per message, charging sends and replies, refunds and the audit log. */
@SpringBootTest(properties = {
        "spring.data.mongodb.database=halappa-wallet",
        "app.uploads-dir=target/test-uploads",
        "app.seed.admin-username=admin",
        "app.seed.admin-password=Admin@12345",
        "app.seed.superadmin-username=owner",
        "app.seed.superadmin-password=Owner@12345",
        "whatsapp.provider=msg91",
        "whatsapp.msg91.integrated-number=919900123406",
        "sms.msg91.auth-key=AUTH",
        "app.campaign.whatsapp-delay-ms=0",
})
@AutoConfigureMockMvc
@DisplayName("Super admin and wallets")
class WalletApiTest {

    // Fake MSG91: numbers ending 0000 fail; free-text to numbers ending 9999 fails (outside 24 h).
    static final HttpServer SERVER;
    static final AtomicBoolean FAIL_0000 = new AtomicBoolean(true);
    static final AtomicInteger IDS = new AtomicInteger();
    static final ObjectMapper M = new ObjectMapper();

    static {
        try {
            SERVER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            SERVER.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4));
            SERVER.createContext("/api/v5/whatsapp/", ex -> {
                JsonNode b = M.readTree(ex.getRequestBody());
                String to = b.has("recipient_number") ? b.path("recipient_number").asText()
                        : b.path("payload").path("template").path("to_and_components").get(0).path("to").get(0).asText();
                boolean fail = (FAIL_0000.get() && to.endsWith("0000")) || to.endsWith("9999");
                byte[] out = (fail ? "{\"status\":\"fail\",\"hasError\":true,\"errors\":\"Not delivered\"}"
                        : "{\"status\":\"success\",\"hasError\":false,\"request_id\":\"r-" + IDS.incrementAndGet() + "\"}").getBytes();
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
    @Autowired AdminUserRepository admins;
    @Autowired WalletTxnRepository txns;
    @Autowired WalletRatesRepository rates;
    @Autowired CampaignRepository campaigns;
    @Autowired MessageRepository messages;
    @Autowired WalletService wallet;
    static String adminToken, superToken;
    static final AtomicInteger IP = new AtomicInteger(1);

    @BeforeEach
    void reset() throws Exception {
        txns.deleteAll();
        rates.deleteAll();
        campaigns.deleteAll();
        messages.deleteAll();
        AdminUser a = admins.findByUsername("admin").orElseThrow();
        a.setWalletPaise(0);
        admins.save(a);
        FAIL_0000.set(true);
        if (adminToken == null) {
            adminToken = login("admin", "Admin@12345").path("token").asText();
            superToken = login("owner", "Owner@12345").path("token").asText();
        }
    }

    /** The super admin ("owner") signs in on the hidden /superadmin page, admins on the normal one. */
    private JsonNode login(String u, String p) throws Exception {
        return read(loginOn(u, p, "owner".equals(u)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.ResultActions loginOn(String u, String p, boolean superPage) throws Exception {
        int n = IP.incrementAndGet();
        return mvc.perform(post("/api/auth/login").with(r -> { r.setRemoteAddr("10.8.0." + n); return r; })
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + u + "\",\"password\":\"" + p + "\",\"superAdmin\":" + superPage + "}"));
    }

    private RequestPostProcessor as(String token) { return r -> { r.addHeader("Authorization", "Bearer " + token); return r; }; }
    private RequestPostProcessor admin() { return as(adminToken); }
    private RequestPostProcessor sup() { return as(superToken); }
    private JsonNode read(String s) throws Exception { return json.readTree(s); }
    private String body(Object o) throws Exception { return json.writeValueAsString(o); }

    private long balance() { return admins.findByUsername("admin").orElseThrow().getWalletPaise(); }

    private void recharge(String amount) throws Exception {
        mvc.perform(post("/api/super/admins/admin/recharge").with(sup()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("amount", amount, "note", "UPI 123")))).andExpect(status().isOk());
    }

    private void setRates(String wa, String sms, String email) throws Exception {
        mvc.perform(put("/api/super/rates").with(sup()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("whatsapp", wa, "sms", sms, "email", email)))).andExpect(status().isOk());
    }

    private JsonNode send(String token, List<String> phones) throws Exception {
        List<Map<String, Object>> people = new ArrayList<>();
        for (String p : phones) people.add(Map.of("name", "P" + p, "phone", p));
        return read(mvc.perform(post("/api/admin/campaigns").with(as(token)).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Invite", "channel", "whatsapp", "template", "kit_invite", "message", "Hi", "people", people))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private void waitDone(long id) throws Exception {
        for (int i = 0; i < 300; i++) {
            Campaign c = campaigns.findById(id).orElseThrow();
            if (!"running".equals(c.getStatus())) return;
            Thread.sleep(50);
        }
        throw new AssertionError("send didn't finish");
    }

    private List<WalletTxn> log(String type) {
        return txns.findAll().stream().filter(t -> type.equals(t.getType())).sorted(Comparator.comparing(WalletTxn::getId)).toList();
    }

    // ---------- roles ----------

    @Test
    void superAdminHasItsOwnScreensAndAdminsCantUseThem() throws Exception {
        assertThat(login("admin", "Admin@12345").path("role").asText()).isEqualTo("ADMIN");
        assertThat(login("owner", "Owner@12345").path("role").asText()).isEqualTo("SUPER_ADMIN");

        mvc.perform(get("/api/super/admins").with(admin())).andExpect(status().isForbidden());
        mvc.perform(post("/api/super/admins/admin/recharge").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("amount", "100")))).andExpect(status().isForbidden());
        mvc.perform(put("/api/super/rates").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/super/audit")).andExpect(status().isUnauthorized());

        mvc.perform(get("/api/super/admins").with(sup())).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.username=='admin')].role").value("ADMIN"))
                .andExpect(jsonPath("$[?(@.username=='owner')].role").value("SUPER_ADMIN"));
        // the super admin can also use every admin screen
        mvc.perform(get("/api/admin/enquiries").with(sup())).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").with(sup())).andExpect(jsonPath("$.role").value("SUPER_ADMIN"));
    }

    @Test
    void eachSignInPageOnlyAcceptsItsOwnKindOfAccount() throws Exception {
        // the super admin can't sign in on the normal admin page (same answer as a wrong password)…
        loginOn("owner", "Owner@12345", false).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Wrong username or password"));
        // …and admins can't sign in on the hidden /superadmin page
        loginOn("admin", "Admin@12345", true).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Wrong username or password"));
        // each on its own page works
        loginOn("owner", "Owner@12345", true).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("SUPER_ADMIN"));
        loginOn("admin", "Admin@12345", false).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
    }

    // ---------- password reset by the super admin ----------

    @Test
    void superAdminSetsAnAdminsPasswordWithoutTheOldOne() throws Exception {
        try {
            mvc.perform(post("/api/super/admins/admin/password").with(sup()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("password", "Fresh@2026")))).andExpect(status().isOk());
            loginOn("admin", "Admin@12345", false).andExpect(status().isUnauthorized());
            loginOn("admin", "Fresh@2026", false).andExpect(status().isOk());

            // too short, unknown admin, the super admin itself, and admins: all refused
            mvc.perform(post("/api/super/admins/admin/password").with(sup()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("password", "short")))).andExpect(status().isBadRequest());
            mvc.perform(post("/api/super/admins/nobody/password").with(sup()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("password", "Fresh@2026")))).andExpect(status().isNotFound());
            mvc.perform(post("/api/super/admins/owner/password").with(sup()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("password", "Fresh@2026")))).andExpect(status().isNotFound());
            mvc.perform(post("/api/super/admins/admin/password").with(admin()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("password", "Fresh@2026")))).andExpect(status().isForbidden());
        } finally {
            mvc.perform(post("/api/super/admins/admin/password").with(sup()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("password", "Admin@12345")))).andExpect(status().isOk());
        }
    }

    // ---------- recharge / deduct ----------

    @Test
    void superAdminRechargesAndEveryMovementIsLogged() throws Exception {
        recharge("500.50");
        assertThat(balance()).isEqualTo(50050);
        WalletTxn t = log(WalletTxn.RECHARGE).get(0);
        assertThat(t.getAdmin()).isEqualTo("admin");
        assertThat(t.getAmountPaise()).isEqualTo(50050);
        assertThat(t.getBalanceAfterPaise()).isEqualTo(50050);
        assertThat(t.getBy()).isEqualTo("owner");
        assertThat(t.getNote()).isEqualTo("UPI 123");

        mvc.perform(post("/api/super/admins/admin/deduct").with(sup()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("amount", "0.50", "note", "correction"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.amountPaise").value(-50)).andExpect(jsonPath("$.balanceAfterPaise").value(50000));
        mvc.perform(post("/api/super/admins/admin/deduct").with(sup()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("amount", "600"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("₹500.00")));
        assertThat(balance()).isEqualTo(50000);

        mvc.perform(get("/api/admin/wallet").with(admin())).andExpect(jsonPath("$.balancePaise").value(50000));
    }

    @Test
    void badAmountsAreRefused() throws Exception {
        for (String bad : new String[] { "", "abc", "-5", "0", "1.234", "10000000.01" }) {
            mvc.perform(post("/api/super/admins/admin/recharge").with(sup()).contentType(MediaType.APPLICATION_JSON)
                    .content(body(Map.of("amount", bad)))).andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/super/admins/owner/recharge").with(sup()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("amount", "10"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("doesn't have a wallet")));
        mvc.perform(post("/api/super/admins/nobody/recharge").with(sup()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("amount", "10")))).andExpect(status().isNotFound());
        assertThat(balance()).isZero();
        assertThat(txns.count()).isZero();
        assertThat(WalletService.toPaise("₹1,250.5")).isEqualTo(125050);
        assertThat(WalletService.rupees(80)).isEqualTo("₹0.80");
    }

    // ---------- prices ----------

    @Test
    void pricesAreSetBySuperAdminAndShownToAdmins() throws Exception {
        setRates("0.80", "0.25", "0.10");
        mvc.perform(get("/api/admin/wallet").with(admin()))
                .andExpect(jsonPath("$.rates.whatsappPaise").value(80))
                .andExpect(jsonPath("$.rates.smsPaise").value(25))
                .andExpect(jsonPath("$.rates.emailPaise").value(10));
        assertThat(log(WalletTxn.RATES).get(0).getNote()).contains("WhatsApp ₹0.80", "SMS ₹0.25", "Email ₹0.10");
        mvc.perform(put("/api/super/rates").with(sup()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("whatsapp", "-1", "sms", "0", "email", "0")))).andExpect(status().isBadRequest());
    }

    // ---------- charging sends ----------

    @Test
    void aSendIsPaidUpFrontAndFailedMessagesAreRefunded() throws Exception {
        setRates("0.80", "0", "0");
        recharge("10");
        JsonNode v = send(adminToken, List.of("9845011111", "9845022222", "9845033333", "9845044444", "9845050000"));
        long id = v.path("campaign").path("id").asLong();
        assertThat(balance()).isEqualTo(1000 - 400);          // 5 × ₹0.80 taken before sending
        waitDone(id);
        assertThat(balance()).isEqualTo(1000 - 400 + 80);     // the failed one comes back

        WalletTxn sendTxn = log(WalletTxn.SEND).get(0);
        assertThat(sendTxn.getAmountPaise()).isEqualTo(-400);
        assertThat(sendTxn.getMessages()).isEqualTo(5);
        assertThat(sendTxn.getRatePaise()).isEqualTo(80);
        assertThat(sendTxn.getCampaignId()).isEqualTo(id);
        assertThat(sendTxn.getCampaignName()).isEqualTo("Invite");
        assertThat(sendTxn.getBalanceAfterPaise()).isEqualTo(600);
        WalletTxn refund = log(WalletTxn.REFUND).get(0);
        assertThat(refund.getAmountPaise()).isEqualTo(80);
        assertThat(refund.getMessages()).isEqualTo(1);
        assertThat(refund.getBalanceAfterPaise()).isEqualTo(680);

        // Retry the failed one: paid again, and nothing extra refunded once it succeeds
        FAIL_0000.set(false);
        mvc.perform(post("/api/admin/campaigns/" + id + "/retry-failed").with(admin())).andExpect(status().isOk());
        waitDone(id);
        assertThat(balance()).isEqualTo(600);
        assertThat(log(WalletTxn.SEND)).hasSize(2);
        assertThat(log(WalletTxn.REFUND)).hasSize(1);
    }

    @Test
    void notEnoughBalanceStopsTheSendBeforeAnythingHappens() throws Exception {
        setRates("0.80", "0", "0");
        recharge("2");
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("name", "Too big", "channel", "whatsapp", "template", "kit_invite", "message", "Hi",
                                "people", List.of(Map.of("phone", "9845011111"), Map.of("phone", "9845022222"), Map.of("phone", "9845033333"))))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("Not enough balance")))
                .andExpect(jsonPath("$.message", containsString("₹2.40")))
                .andExpect(jsonPath("$.message", containsString("₹2.00")));
        assertThat(balance()).isEqualTo(200);
        assertThat(campaigns.count()).isZero();
        assertThat(messages.count()).isZero();
        assertThat(log(WalletTxn.SEND)).isEmpty();
    }

    @Test
    void manualLinkSendsAndFreePricesCostNothing() throws Exception {
        recharge("5");
        // manual (wa.me links): no charge, nothing logged
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "By hand", "channel", "whatsapp", "manual", true, "message", "Hi",
                        "people", List.of(Map.of("phone", "9845011111")))))).andExpect(status().isOk());
        assertThat(log(WalletTxn.SEND)).isEmpty();
        // price ₹0: logged as free
        JsonNode v = send(adminToken, List.of("9845011111"));
        waitDone(v.path("campaign").path("id").asLong());
        assertThat(balance()).isEqualTo(500);
        assertThat(log(WalletTxn.SEND).get(0).getNote()).isEqualTo("Free: price is ₹0");
    }

    @Test
    void superAdminSendsAreLoggedButNotCharged() throws Exception {
        setRates("0.80", "0", "0");
        JsonNode v = send(superToken, List.of("9845011111", "9845022222"));
        waitDone(v.path("campaign").path("id").asLong());
        WalletTxn t = log(WalletTxn.SEND).get(0);
        assertThat(t.getAdmin()).isEqualTo("owner");
        assertThat(t.getAmountPaise()).isZero();
        assertThat(t.getNote()).isEqualTo("Super admin send (not charged)");
        assertThat(campaigns.findById(v.path("campaign").path("id").asLong()).orElseThrow().getChargedTo()).isNull();
    }

    @Test
    void cancelledMessagesAreRefundedOnceOnly() {
        recharge0();
        Campaign c = new Campaign();
        c.setName("Partly cancelled");
        c.setChannel("whatsapp");
        c.setTotal(3);
        c.setStatus("cancelled");
        c.setChargedTo("admin");
        c.setRatePaise(80);
        c.setChargedCount(3);
        c = campaigns.save(c);
        for (String s : new String[] { "sent", "cancelled", "cancelled" }) {
            Message m = new Message();
            m.setCampaignId(c.getId());
            m.setChannel("whatsapp");
            m.setDirection("out");
            m.setContact("919845011111");
            m.setStatus(s);
            messages.save(m);
        }
        wallet.settle(c);
        wallet.settle(campaigns.findById(c.getId()).orElseThrow()); // second call: nothing more
        assertThat(balance()).isEqualTo(160);
        assertThat(log(WalletTxn.REFUND)).hasSize(1);
        assertThat(campaigns.findById(c.getId()).orElseThrow().getRefundedCount()).isEqualTo(2);
    }

    private void recharge0() { /* starts at ₹0 (see reset) */ }

    // ---------- Inbox replies ----------

    @Test
    void inboxRepliesCostOneMessageAndFailedOnesAreRefunded() throws Exception {
        setRates("1.00", "0", "0");
        recharge("1.50");
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("channel", "whatsapp", "contact", "919845011111", "text", "Thanks")))).andExpect(status().isOk());
        assertThat(balance()).isEqualTo(50);
        // outside the 24 h window: fails and the rupee comes back… then not enough balance for another
        recharge("0.50");
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("channel", "whatsapp", "contact", "919845019999", "text", "Hello")))).andExpect(status().isBadRequest());
        assertThat(balance()).isEqualTo(100);
        assertThat(log(WalletTxn.REPLY)).hasSize(2);
        assertThat(log(WalletTxn.REFUND)).hasSize(1);
        mvc.perform(post("/api/super/admins/admin/deduct").with(sup()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("amount", "0.50")))).andExpect(status().isOk());
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("channel", "whatsapp", "contact", "919845011111", "text", "Again"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("Not enough balance")));
        assertThat(balance()).isEqualTo(50);
    }

    // ---------- audit log ----------

    @Test
    void auditLogFiltersAndAdminsSeeOnlyTheirOwnLines() throws Exception {
        setRates("0.80", "0", "0");
        recharge("10");
        JsonNode v = send(adminToken, List.of("9845011111"));
        waitDone(v.path("campaign").path("id").asLong());
        send(superToken, List.of("9845022222"));

        mvc.perform(get("/api/super/audit").with(sup())).andExpect(jsonPath("$.total").value(4)) // rates, recharge, 2 sends
                .andExpect(jsonPath("$.items[0].type").value("SEND"));                              // newest first
        mvc.perform(get("/api/super/audit").with(sup()).param("admin", "admin")).andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/super/audit").with(sup()).param("type", "recharge")).andExpect(jsonPath("$.total").value(1));
        String today = LocalDate.now().toString(), tomorrow = LocalDate.now().plusDays(1).toString();
        mvc.perform(get("/api/super/audit").with(sup()).param("from", today).param("to", today)).andExpect(jsonPath("$.total").value(4));
        mvc.perform(get("/api/super/audit").with(sup()).param("from", tomorrow)).andExpect(jsonPath("$.total").value(0));

        mvc.perform(get("/api/admin/wallet/log").with(admin())).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[?(@.admin != 'admin')]").isEmpty());
    }
}
