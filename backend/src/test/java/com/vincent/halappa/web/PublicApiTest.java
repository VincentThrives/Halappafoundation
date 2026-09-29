package com.vincent.halappa.web;

import com.vincent.halappa.domain.Enquiry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("Public website API")
class PublicApiTest extends ApiTestBase {

    // ---------- Content ----------

    @Test
    void settingsHaveContactDetailsInBothLanguages() throws Exception {
        mvc.perform(get("/api/public/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("9900123406"))
                .andExpect(jsonPath("$.whatsapp").value("919900123406"))
                .andExpect(jsonPath("$.email").value("info@halappafoundation.in"))
                .andExpect(jsonPath("$.addressKn", containsString("ಮಧುಗಿರಿ")));
    }

    @Test
    void seededArticlesAreListedNewestFirstWithKannada() throws Exception {
        mvc.perform(get("/api/public/posts").param("section", "views").param("category", "articles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total", greaterThanOrEqualTo(6)))
                .andExpect(jsonPath("$.items[0].titleKn", not(emptyOrNullString())));
    }

    @Test
    void emptyCategoryReturnsEmptyPage() throws Exception {
        mvc.perform(get("/api/public/posts").param("section", "press").param("category", "critic"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void pageSizeIsCapped() throws Exception {
        mvc.perform(get("/api/public/posts").param("size", "9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(50));
    }

    @Test
    void unknownPostIs404() throws Exception {
        mvc.perform(get("/api/public/posts/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Post not found"));
    }

    @Test
    void timelineIsOrdered() throws Exception {
        mvc.perform(get("/api/public/timeline"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(8))))
                .andExpect(jsonPath("$[0].period").value("Roots"))
                .andExpect(jsonPath("$[0].sortOrder").value(0));
    }

    @Test
    void galleryFiltersByCategory() throws Exception {
        mvc.perform(get("/api/public/gallery").param("category", "government-events"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].category", everyItem(is("government-events"))));
    }

    // ---------- Contact form ----------

    @Test
    void emailEnquiryIsSavedWithReferenceAndNoWhatsAppLink() throws Exception {
        String res = mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validEnquiry("email"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.whatsappUrl").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        Enquiry saved = enquiries.findById(read(res).get("id").asLong()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("new");
        assertThat(saved.getChannel()).isEqualTo("email");
        assertThat(saved.getName()).isEqualTo("Ramesh Kumar");
    }

    @Test
    void whatsappEnquiryReturnsPrefilledChatLinkToFoundationNumber() throws Exception {
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validEnquiry("whatsapp"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.whatsappUrl", startsWith("https://wa.me/919900123406?text=Halappa%20Foundation%20%7C%20Ref%20%23")))
                .andExpect(jsonPath("$.whatsappUrl", containsString("Please%20share%20hostel%20details.")));
    }

    @Test
    void kannadaEnquiryIsStoredIntact() throws Exception {
        Map<String, Object> body = validEnquiry("email");
        body.put("name", "ಸುರೇಶ್ ಕುಮಾರ್");
        body.put("message", "ಉದ್ಯೋಗ ಮೇಳ ಯಾವಾಗ?");
        body.put("lang", "kn");
        String res = mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON)
                        .characterEncoding("UTF-8").content(toJson(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Enquiry saved = enquiries.findById(read(res).get("id").asLong()).orElseThrow();
        assertThat(saved.getName()).isEqualTo("ಸುರೇಶ್ ಕುಮಾರ್");
        assertThat(saved.getMessage()).isEqualTo("ಉದ್ಯೋಗ ಮೇಳ ಯಾವಾಗ?");
        assertThat(saved.getLang()).isEqualTo("kn");
    }

    @Test
    void unknownTypeFallsBackToQuery() throws Exception {
        Map<String, Object> body = validEnquiry("email");
        body.put("type", "hacker");
        String res = mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertThat(enquiries.findById(read(res).get("id").asLong()).orElseThrow().getType()).isEqualTo("query");
    }

    @Test
    void missingNameIsRejected() throws Exception {
        Map<String, Object> body = validEnquiry("email");
        body.remove("name");
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", startsWith("name")));
    }

    @Test
    void missingMessageIsRejected() throws Exception {
        Map<String, Object> body = validEnquiry("email");
        body.put("message", "   ");
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidPhoneIsRejected() throws Exception {
        for (String phone : new String[]{"12", "abcdefghij", "98765"}) {
            Map<String, Object> body = validEnquiry("email");
            body.put("phone", phone);
            mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message", containsString("phone")));
        }
    }

    @Test
    void invalidEmailIsRejected() throws Exception {
        Map<String, Object> body = validEnquiry("email");
        body.put("email", "not-an-email");
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidChannelIsRejected() throws Exception {
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validEnquiry("sms"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void honeypotFilledByBotIsRejected() throws Exception {
        Map<String, Object> body = validEnquiry("email");
        body.put("website", "http://spam.example");
        long before = enquiries.count();
        mvc.perform(post("/api/public/enquiries").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isBadRequest());
        assertThat(enquiries.count()).isEqualTo(before);
    }

    @Test
    void tooManySubmissionsFromOneVisitorAreThrottled() throws Exception {
        var sameIp = newIp();
        for (int i = 0; i < 6; i++) {
            mvc.perform(post("/api/public/enquiries").with(sameIp).contentType(MediaType.APPLICATION_JSON)
                    .content(toJson(validEnquiry("email")))).andExpect(status().isCreated());
        }
        mvc.perform(post("/api/public/enquiries").with(sameIp).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validEnquiry("email"))))
                .andExpect(status().isTooManyRequests());
    }

    // ---------- Security boundaries ----------

    @Test
    void adminApisNeedLogin() throws Exception {
        for (String url : new String[]{"/api/admin/enquiries", "/api/admin/enquiries/export?all=true",
                "/api/admin/dashboard", "/api/admin/settings", "/api/admin/whatsapp/broadcasts", "/api/auth/me"}) {
            mvc.perform(get(url)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void missingImageIs404NotAServerError() throws Exception {
        mvc.perform(get("/uploads/does-not-exist.jpg")).andExpect(status().isNotFound());
    }

    @Test
    void forgedTokenIsRejected() throws Exception {
        mvc.perform(get("/api/admin/enquiries").header("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.forged"))
                .andExpect(status().isUnauthorized());
    }
}
