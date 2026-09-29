package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.vincent.halappa.domain.CampaignRepository;
import com.vincent.halappa.domain.MessageRepository;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Bulk sends without any provider connected: manual WhatsApp, vouchers, limits, check-in, inbox. */
@DisplayName("Admin: bulk messages (no providers connected)")
class CampaignApiTest extends ApiTestBase {

    @Autowired MessageRepository messages;
    @Autowired CampaignRepository campaigns;

    @BeforeEach
    void clean() {
        messages.deleteAll();
        campaigns.deleteAll();
        enquiries.deleteAll();
    }

    private static Map<String, Object> person(String name, String phone, String voucher) {
        Map<String, Object> p = new HashMap<>();
        p.put("name", name);
        p.put("phone", phone);
        p.put("voucher", voucher);
        return p;
    }

    private Map<String, Object> request(List<Map<String, Object>> people, Map<String, Object> voucher) {
        Map<String, Object> r = new HashMap<>();
        r.put("name", "Kit distribution – Madhugiri");
        r.put("channel", "whatsapp");
        r.put("people", people);
        r.put("message", "Namaskara {name}, please attend the kit distribution. Entrance voucher: {voucher}");
        r.put("voucher", voucher);
        return r;
    }

    private JsonNode create(Map<String, Object> body) throws Exception {
        return read(mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private void createFails(Map<String, Object> body, String message) throws Exception {
        mvc.perform(post("/api/admin/campaigns").with(admin()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString(message)));
    }

    // ---------- Channels & import ----------

    @Test
    void channelsShowNothingConnected() throws Exception {
        mvc.perform(get("/api/admin/campaigns/channels").with(admin()))
                .andExpect(jsonPath("$.whatsappApi").value(false))
                .andExpect(jsonPath("$.email").value(false))
                .andExpect(jsonPath("$.sms").value(false))
                .andExpect(jsonPath("$.maxRecipients").value(5000));
    }

    @Test
    void importEndpointAndTemplate() throws Exception {
        byte[] tpl = mvc.perform(get("/api/admin/campaigns/template").with(admin()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("halappa-recipients-template.xlsx")))
                .andReturn().getResponse().getContentAsByteArray();
        mvc.perform(multipart("/api/admin/campaigns/import").file(new MockMultipartFile("file", "t.xlsx", "application/octet-stream", tpl)).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(2)))
                .andExpect(jsonPath("$.rows[0].phone").value("919845012345"))
                .andExpect(jsonPath("$.hasVoucherColumn").value(true));
    }

    // ---------- Vouchers ----------

    @Test
    void autoVouchersAreNumberedInOrderAndPutInEachMessage() throws Exception {
        JsonNode res = create(request(List.of(person("Ramesh", "9845012345", null), person("Suma", "9123456789", null)),
                Map.of("mode", "auto", "prefix", "kit-2026-", "start", 1, "digits", 4)));
        assertThat(res.path("campaign").path("mode").asText()).isEqualTo("manual");
        assertThat(res.path("campaign").path("voucherInfo").asText()).isEqualTo("KIT-2026-0001 – KIT-2026-0002");
        assertThat(res.path("stats").path("total").asInt()).isEqualTo(2);
        long id = res.path("campaign").path("id").asLong();

        mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin()))
                .andExpect(jsonPath("$.items[0].voucher").value("KIT-2026-0001"))
                .andExpect(jsonPath("$.items[0].body").value("Namaskara Ramesh, please attend the kit distribution. Entrance voucher: KIT-2026-0001"))
                .andExpect(jsonPath("$.items[1].voucher").value("KIT-2026-0002"))
                .andExpect(jsonPath("$.items[1].contact").value("919123456789"))
                .andExpect(jsonPath("$.items[1].status").value("manual"));
    }

    @Test
    void autoVouchersNeverRepeatAcrossSends() throws Exception {
        create(request(List.of(person("A", "9845012345", null)), Map.of("mode", "auto", "prefix", "KIT-", "start", 1)));
        createFails(request(List.of(person("B", "9123456789", null)), Map.of("mode", "auto", "prefix", "KIT-", "start", 1)),
                "Voucher KIT-0001 was already issued earlier. Change the prefix or start number.");
        create(request(List.of(person("B", "9123456789", null)), Map.of("mode", "auto", "prefix", "KIT-", "start", 2)));
    }

    @Test
    void vouchersFromTheExcelFile() throws Exception {
        JsonNode res = create(request(List.of(person("A", "9845012345", "hv-501"), person("B", "9123456789", "HV-502")), Map.of("mode", "excel")));
        mvc.perform(get("/api/admin/campaigns/" + res.path("campaign").path("id").asLong() + "/recipients").with(admin()))
                .andExpect(jsonPath("$.items[*].voucher", contains("HV-501", "HV-502")));
    }

    @Test
    void excelVouchersMustBePresentAndUnique() throws Exception {
        createFails(request(List.of(person("A", "9845012345", "V1"), person("B", "9123456789", null)), Map.of("mode", "excel")),
                "1 people have no voucher in the file, e.g. B");
        createFails(request(List.of(person("A", "9845012345", "V1"), person("B", "9123456789", "v1")), Map.of("mode", "excel")),
                "Voucher V1 appears twice");
    }

    @Test
    void sameVoucherCodeForEveryone() throws Exception {
        JsonNode res = create(request(List.of(person("A", "9845012345", null), person("B", "9123456789", null)),
                Map.of("mode", "fixed", "fixed", "madhugiri-kit")));
        assertThat(res.path("campaign").path("voucherInfo").asText()).isEqualTo("MADHUGIRI-KIT");
        createFails(request(List.of(person("A", "9845012345", null)), Map.of("mode", "fixed", "fixed", " ")), "Enter the voucher code");
    }

    @Test
    void noVoucherWhenSwitchedOff() throws Exception {
        Map<String, Object> r = request(List.of(person("A", "9845012345", null)), Map.of("mode", "none"));
        r.put("message", "Hi {name}{voucher}");
        JsonNode res = create(r);
        mvc.perform(get("/api/admin/campaigns/" + res.path("campaign").path("id").asLong() + "/recipients").with(admin()))
                .andExpect(jsonPath("$.items[0].voucher").doesNotExist())
                .andExpect(jsonPath("$.items[0].body").value("Hi A"));
    }

    // ---------- Recipients & limits ----------

    @Test
    void duplicatesAreMergedAndInvalidNumbersDropped() throws Exception {
        Map<String, Object> r = request(List.of(person("A", "9845012345", null), person("A again", "+91 98450 12345", null),
                person("Bad", "123", null)), Map.of("mode", "none"));
        r.put("pasted", "9123456789, 9845012345");
        assertThat(create(r).path("stats").path("total").asInt()).isEqualTo(2);
    }

    @Test
    void fiveThousandRecipientsInOneSend() throws Exception {
        List<Map<String, Object>> people = new ArrayList<>();
        for (int i = 0; i < 5000; i++) people.add(person("P" + i, "9" + String.format("%09d", i), null));
        JsonNode res = create(request(people, Map.of("mode", "auto", "prefix", "BIG-", "start", 1, "digits", 5)));
        assertThat(res.path("stats").path("total").asInt()).isEqualTo(5000);
        assertThat(res.path("campaign").path("voucherInfo").asText()).isEqualTo("BIG-00001 – BIG-05000");
        assertThat(messages.count()).isEqualTo(5000);
    }

    @Test
    void moreThan5000IsRefused() throws Exception {
        List<Map<String, Object>> people = new ArrayList<>();
        for (int i = 0; i < 5001; i++) people.add(person("P" + i, "9" + String.format("%09d", i), null));
        createFails(request(people, Map.of("mode", "none")), "Too many recipients: 5001. The limit is 5000");
    }

    @Test
    void recipientsFromEnquiriesByDateRange() throws Exception {
        saveEnquiry("Old", "9845000001", LocalDateTime.of(2026, 8, 1, 10, 0), "email", "new");
        saveEnquiry("New", "9845000002", LocalDateTime.of(2026, 9, 20, 10, 0), "email", "new");
        Map<String, Object> r = request(null, Map.of("mode", "none"));
        r.put("allEnquiries", true);
        r.put("from", "2026-09-01");
        r.put("to", "2026-09-30");
        JsonNode res = create(r);
        mvc.perform(get("/api/admin/campaigns/" + res.path("campaign").path("id").asLong() + "/recipients").with(admin()))
                .andExpect(jsonPath("$.items[*].name", contains("New")));
    }

    @Test
    void validation() throws Exception {
        Map<String, Object> r = request(List.of(person("A", "9845012345", null)), Map.of("mode", "none"));
        r.put("channel", "fax");
        createFails(r, "Choose WhatsApp, Email or SMS");
        r.put("channel", "whatsapp");
        r.put("name", " ");
        createFails(r, "Give this send a name");
        r.put("name", "X");
        r.put("message", "");
        createFails(r, "Write the message");
        r.put("message", "Hi");
        r.put("people", List.of(person("Bad", "12", null)));
        createFails(r, "No valid phone numbers");
    }

    @Test
    void emailAndSmsNeedTheirProvidersFirst() throws Exception {
        Map<String, Object> r = request(List.of(person("A", "9845012345", null)), Map.of("mode", "none"));
        r.put("channel", "email");
        r.put("subject", "Invite");
        createFails(r, "Email is not connected");
        r.put("channel", "sms");
        createFails(r, "SMS is not connected");
    }

    // ---------- Manual WhatsApp progress, export, check-in ----------

    @Test
    void manualSendCompletesWhenEveryLinkIsOpened() throws Exception {
        JsonNode res = create(request(List.of(person("A", "9845012345", null), person("B", "9123456789", null)), Map.of("mode", "none")));
        long id = res.path("campaign").path("id").asLong();
        JsonNode rec = read(mvc.perform(get("/api/admin/campaigns/" + id + "/recipients").with(admin())).andReturn().getResponse().getContentAsString());
        for (JsonNode m : rec.path("items")) {
            mvc.perform(post("/api/admin/campaigns/" + id + "/recipients/" + m.path("id").asLong() + "/manual-sent").with(admin()))
                    .andExpect(jsonPath("$.status").value("sent"));
        }
        mvc.perform(get("/api/admin/campaigns/" + id).with(admin()))
                .andExpect(jsonPath("$.campaign.status").value("done"))
                .andExpect(jsonPath("$.stats.sent").value(2))
                .andExpect(jsonPath("$.stats.manual").value(0));
    }

    @Test
    void exportListsEveryoneWithTheirVoucher() throws Exception {
        long id = create(request(List.of(person("Ramesh", "9845012345", null), person("Suma", "9123456789", null)),
                Map.of("mode", "auto", "prefix", "EX-", "start", 7))).path("campaign").path("id").asLong();
        byte[] x = mvc.perform(get("/api/admin/campaigns/" + id + "/export").with(admin()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("send-" + id + "-Kit-distribution-Madhugiri.xlsx")))
                .andReturn().getResponse().getContentAsByteArray();
        try (var wb = new XSSFWorkbook(new ByteArrayInputStream(x))) {
            var s = wb.getSheet("Recipients");
            assertThat(s.getRow(0).getCell(3).getStringCellValue()).isEqualTo("Voucher");
            assertThat(s.getRow(1).getCell(1).getStringCellValue()).isEqualTo("Ramesh");
            assertThat(s.getRow(1).getCell(3).getStringCellValue()).isEqualTo("EX-0007");
            assertThat(s.getRow(2).getCell(3).getStringCellValue()).isEqualTo("EX-0008");
        }
    }

    @Test
    void voucherCheckInAtTheEvent() throws Exception {
        long id = create(request(List.of(person("Ramesh", "9845012345", null)), Map.of("mode", "auto", "prefix", "CHK-", "start", 1)))
                .path("campaign").path("id").asLong();
        String res = mvc.perform(get("/api/admin/vouchers").with(admin()).param("code", " chk-0001 "))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Ramesh"))
                .andExpect(jsonPath("$[0].attendedAt").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        long mid = read(res).get(0).path("id").asLong();
        mvc.perform(post("/api/admin/vouchers/" + mid + "/attend").with(admin()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.attendedAt").exists());
        mvc.perform(post("/api/admin/vouchers/" + mid + "/attend").with(admin()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message", startsWith("Already checked in at")));
        mvc.perform(get("/api/admin/campaigns/" + id).with(admin())).andExpect(jsonPath("$.stats.attended").value(1));
        mvc.perform(get("/api/admin/vouchers").with(admin()).param("code", "NOPE")).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void cancelStopsAManualSend() throws Exception {
        long id = create(request(List.of(person("A", "9845012345", null)), Map.of("mode", "none"))).path("campaign").path("id").asLong();
        mvc.perform(post("/api/admin/campaigns/" + id + "/cancel").with(admin())).andExpect(jsonPath("$.campaign.status").value("cancelled"));
        mvc.perform(post("/api/admin/campaigns/" + id + "/cancel").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/campaigns/" + id + "/pause").with(admin())).andExpect(status().isBadRequest());
    }

    // ---------- Inbox basics ----------

    @Test
    void contactFormSubmissionsAppearInTheInboxAsUnread() throws Exception {
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(validEnquiry("whatsapp"))))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/admin/inbox/unread").with(admin())).andExpect(jsonPath("$.unread").value(1));
        mvc.perform(get("/api/admin/inbox/threads").with(admin()).param("channel", "web"))
                .andExpect(jsonPath("$.items[0].contact").value("919845012345"))
                .andExpect(jsonPath("$.items[0].name").value("Ramesh Kumar"))
                .andExpect(jsonPath("$.items[0].unread").value(1));
        mvc.perform(get("/api/admin/inbox/thread").with(admin()).param("channel", "web").param("contact", "919845012345"))
                .andExpect(jsonPath("$[0].direction").value("in"))
                .andExpect(jsonPath("$[0].body", containsString("Please share hostel details.")));
        mvc.perform(get("/api/admin/inbox/unread").with(admin())).andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    void conversationsHideSendOnlyContactsUnlessAsked() throws Exception {
        create(request(List.of(person("A", "9845012345", null)), Map.of("mode", "none")));
        mvc.perform(get("/api/admin/inbox/threads").with(admin())).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/admin/inbox/threads").with(admin()).param("includeSentOnly", "true")).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/admin/inbox/messages").with(admin()).param("direction", "out"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].status").value("manual"));
    }

    @Test
    void manualWhatsAppReplyGivesAChatLink() throws Exception {
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("channel", "whatsapp", "contact", "919845012345", "text", "Thank you"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.link").value("https://wa.me/919845012345?text=Thank%20you"))
                .andExpect(jsonPath("$.message.status").value("manual"));
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("channel", "sms", "contact", "919845012345", "text", "x"))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/inbox/reply").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("channel", "whatsapp", "contact", "919845012345", "text", " "))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void webhooksRejectCallersWithoutSecrets() throws Exception {
        mvc.perform(get("/api/webhooks/whatsapp").param("hub.mode", "subscribe").param("hub.verify_token", "x").param("hub.challenge", "42"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/webhooks/sms").param("token", "x").param("from", "9845012345").param("message", "hi"))
                .andExpect(status().isForbidden());
    }

    @Test
    void campaignApisNeedLogin() throws Exception {
        mvc.perform(get("/api/admin/campaigns")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/inbox/threads")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/vouchers").param("code", "x")).andExpect(status().isUnauthorized());
    }
}
