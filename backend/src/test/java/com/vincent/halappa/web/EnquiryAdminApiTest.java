package com.vincent.halappa.web;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DisplayName("Admin: queries, search, Excel download")
class EnquiryAdminApiTest extends ApiTestBase {

    static final LocalDate D1 = LocalDate.of(2026, 8, 31);
    static final LocalDate D2 = LocalDate.of(2026, 9, 1);
    static final LocalDate D3 = LocalDate.of(2026, 9, 15);
    static final LocalDate D4 = LocalDate.of(2026, 9, 30);

    long a, b, c, d;

    @BeforeEach
    void data() {
        enquiries.deleteAll();
        a = saveEnquiry("Anil", "9845000001", D1.atTime(23, 59, 59), "email", "new").getId();
        b = saveEnquiry("Bhavya", "9845000002", D2.atStartOfDay(), "whatsapp", "new").getId();
        c = saveEnquiry("Chandra", "9845000003", D3.atTime(12, 0), "email", "resolved").getId();
        d = saveEnquiry("Deepa", "9845000004", D4.atTime(LocalTime.of(23, 59)), "whatsapp", "in-progress").getId();
    }

    // ---------- List & search ----------

    @Test
    void listsNewestFirst() throws Exception {
        mvc.perform(get("/api/admin/enquiries").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(4))
                .andExpect(jsonPath("$.items[0].name").value("Deepa"))
                .andExpect(jsonPath("$.items[3].name").value("Anil"));
    }

    @Test
    void searchMatchesNamePhoneAndMessageCaseInsensitively() throws Exception {
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("q", "bhav"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].name").value("Bhavya"));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("q", "000003"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].name").value("Chandra"));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("q", "MESSAGE FROM DEEPA"))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("q", "tumakuru"))
                .andExpect(jsonPath("$.total").value(4));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("q", "zzz"))
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void filtersByStatusAndChannel() throws Exception {
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("status", "new"))
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("channel", "whatsapp"))
                .andExpect(jsonPath("$.total").value(2));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("status", "new").param("channel", "whatsapp"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].name").value("Bhavya"));
    }

    @Test
    void dateFilterIncludesBothEndDays() throws Exception {
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("from", "2026-09-01").param("to", "2026-09-30"))
                .andExpect(jsonPath("$.total").value(3))
                .andExpect(jsonPath("$.items[*].name", containsInAnyOrder("Bhavya", "Chandra", "Deepa")));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("to", "2026-08-31"))
                .andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].name").value("Anil"));
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("from", "2026-09-15").param("to", "2026-09-15"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void paginates() throws Exception {
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("size", "3").param("page", "1"))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.total").value(4))
                .andExpect(jsonPath("$.page").value(1));
    }

    // ---------- Update & delete ----------

    @Test
    void updatesStatusAndNotes() throws Exception {
        mvc.perform(patch("/api/admin/enquiries/" + a).with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"resolved\",\"notes\":\"Called back\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.notes").value("Called back"));
    }

    @Test
    void rejectsUnknownStatus() throws Exception {
        mvc.perform(patch("/api/admin/enquiries/" + a).with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"done\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updatingMissingEnquiryIs404() throws Exception {
        mvc.perform(patch("/api/admin/enquiries/999999").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"new\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletesSelected() throws Exception {
        mvc.perform(post("/api/admin/enquiries/delete").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + a + "," + b + "]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deleted").value(2));
        assertThat(enquiries.count()).isEqualTo(2);
    }

    @Test
    void deletingEnquiriesAlsoRemovesTheirInboxCopies() throws Exception {
        String res = mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(validEnquiry("email"))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = read(res).get("id").asLong();
        String ref = "Ref #" + id + " ";
        mvc.perform(get("/api/admin/inbox/messages").with(admin()).param("channel", "web").param("q", ref))
                .andExpect(jsonPath("$.total").value(1));
        mvc.perform(post("/api/admin/enquiries/delete").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[" + id + "]}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/inbox/messages").with(admin()).param("channel", "web").param("q", ref))
                .andExpect(jsonPath("$.total").value(0));
        // Other enquiries are untouched.
        assertThat(enquiries.count()).isEqualTo(4);
    }

    @Test
    void deleteNeedsASelectionAndIgnoresAlreadyDeletedIds() throws Exception {
        mvc.perform(post("/api/admin/enquiries/delete").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Select at least one enquiry"));
        mvc.perform(post("/api/admin/enquiries/delete").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[999999]}"))
                .andExpect(status().isOk());
        assertThat(enquiries.count()).isEqualTo(4);
    }

    @Test
    void editingNotesKeepsStatusAndViceVersa() throws Exception {
        mvc.perform(patch("/api/admin/enquiries/" + c).with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"Visited\"}"))
                .andExpect(jsonPath("$.status").value("resolved")).andExpect(jsonPath("$.notes").value("Visited"));
        mvc.perform(patch("/api/admin/enquiries/" + c).with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"new\"}"))
                .andExpect(jsonPath("$.status").value("new")).andExpect(jsonPath("$.notes").value("Visited"));
        mvc.perform(patch("/api/admin/enquiries/" + c).with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"notes\":\"\"}"))
                .andExpect(jsonPath("$.notes").value(""));
    }

    @Test
    void editAndDeleteNeedLogin() throws Exception {
        mvc.perform(patch("/api/admin/enquiries/" + a).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"resolved\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/enquiries/delete").contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[" + a + "]}"))
                .andExpect(status().isUnauthorized());
        assertThat(enquiries.findById(a).orElseThrow().getStatus()).isEqualTo("new");
    }

    @Test
    void dashboardCounts() throws Exception {
        mvc.perform(get("/api/admin/dashboard").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enquiries.total").value(4))
                .andExpect(jsonPath("$.enquiries.new").value(2))
                .andExpect(jsonPath("$.enquiries.resolved").value(1))
                .andExpect(jsonPath("$.enquiries.whatsapp").value(2))
                .andExpect(jsonPath("$.mailEnabled").value(false))
                .andExpect(jsonPath("$.whatsappApiEnabled").value(false));
    }

    // ---------- Excel download ----------

    @Nested
    @DisplayName("Excel download")
    class Export {

        private MvcResult download(String query) throws Exception {
            return mvc.perform(get("/api/admin/enquiries/export?" + query).with(admin()))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .andReturn();
        }

        private List<String> names(MvcResult r) throws Exception {
            try (var wb = new XSSFWorkbook(new ByteArrayInputStream(r.getResponse().getContentAsByteArray()))) {
                Sheet s = wb.getSheet("Enquiries");
                List<String> out = new ArrayList<>();
                for (Row row : s) if (row.getRowNum() > 0) out.add(row.getCell(2).getStringCellValue());
                return out;
            }
        }

        private String summary(MvcResult r, String label) throws Exception {
            try (var wb = new XSSFWorkbook(new ByteArrayInputStream(r.getResponse().getContentAsByteArray()))) {
                for (Row row : wb.getSheet("Summary")) {
                    if (row.getCell(0) != null && label.equals(row.getCell(0).getStringCellValue())) {
                        var cell = row.getCell(1);
                        return cell.getCellType() == org.apache.poi.ss.usermodel.CellType.NUMERIC
                                ? String.valueOf((long) cell.getNumericCellValue()) : cell.getStringCellValue();
                    }
                }
            }
            return null;
        }

        @Test
        void dateRangeIsInclusiveAndNamedAfterTheRange() throws Exception {
            MvcResult r = download("from=2026-09-01&to=2026-09-30");
            assertThat(r.getResponse().getHeader("Content-Disposition"))
                    .isEqualTo("attachment; filename=\"halappa-enquiries_2026-09-01_to_2026-09-30.xlsx\"");
            assertThat(names(r)).containsExactly("Deepa", "Chandra", "Bhavya");
            assertThat(summary(r, "Period")).isEqualTo("01-09-2026 to 30-09-2026");
            assertThat(summary(r, "Total enquiries")).isEqualTo("3");
        }

        @Test
        void singleDay() throws Exception {
            assertThat(names(download("from=2026-08-31&to=2026-08-31"))).containsExactly("Anil");
        }

        @Test
        void rangeWithNoEnquiriesGivesEmptySheet() throws Exception {
            MvcResult r = download("from=2025-01-01&to=2025-01-31");
            assertThat(names(r)).isEmpty();
            assertThat(summary(r, "Total enquiries")).isEqualTo("0");
        }

        @Test
        void onlyFromDateMeansFromThatDayOnwards() throws Exception {
            MvcResult r = download("from=2026-09-15");
            assertThat(names(r)).containsExactly("Deepa", "Chandra");
            assertThat(summary(r, "Period")).isEqualTo("15-09-2026 to today");
        }

        @Test
        void rangeCombinedWithStatusAndChannel() throws Exception {
            assertThat(names(download("from=2026-09-01&to=2026-09-30&channel=whatsapp"))).containsExactly("Deepa", "Bhavya");
            assertThat(names(download("from=2026-09-01&to=2026-09-30&status=resolved"))).containsExactly("Chandra");
        }

        @Test
        void downloadAllIgnoresEveryFilter() throws Exception {
            MvcResult r = download("all=true&from=2026-09-15&to=2026-09-15&status=resolved");
            assertThat(r.getResponse().getHeader("Content-Disposition")).contains("halappa-enquiries_ALL.xlsx");
            assertThat(names(r)).hasSize(4);
            assertThat(summary(r, "Period")).isEqualTo("All enquiries");
        }

        @Test
        void selectedIdsOnly() throws Exception {
            MvcResult r = download("ids=" + a + "," + c);
            assertThat(names(r)).containsExactlyInAnyOrder("Anil", "Chandra");
            assertThat(summary(r, "Period")).isEqualTo("2 selected enquiries");
        }

        @Test
        void fromAfterToIsRejected() throws Exception {
            mvc.perform(get("/api/admin/enquiries/export?from=2026-09-30&to=2026-09-01").with(admin()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("From date must be on or before To date"));
        }

        @Test
        void badDateIsRejected() throws Exception {
            mvc.perform(get("/api/admin/enquiries/export?from=31-09-2026").with(admin()))
                    .andExpect(status().is4xxClientError());
        }

        @Test
        void downloadNeedsLogin() throws Exception {
            mvc.perform(get("/api/admin/enquiries/export?all=true")).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void enquirySubmittedOnPublicSiteAppearsForAdmin() throws Exception {
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(validEnquiry("email"))))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/admin/enquiries").with(admin()).param("q", "Ramesh")
                        .param("from", LocalDateTime.now().toLocalDate().toString()).param("to", LocalDateTime.now().toLocalDate().toString()))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].status").value("new"));
    }
}
