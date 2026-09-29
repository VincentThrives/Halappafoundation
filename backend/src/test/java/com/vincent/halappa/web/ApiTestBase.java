package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vincent.halappa.domain.Enquiry;
import com.vincent.halappa.domain.EnquiryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Full application with an in-memory H2 database; all API test classes share one context. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:halappa-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "app.uploads-dir=target/test-uploads",
        "app.seed.admin-username=admin",
        "app.seed.admin-password=Test@12345",
        "whatsapp.token=",
        "whatsapp.phone-number-id=",
        "spring.mail.host=",
})
@AutoConfigureMockMvc
public abstract class ApiTestBase {

    protected static final String ADMIN_PASSWORD = "Test@12345";
    private static final AtomicInteger IP = new AtomicInteger(1);
    private static String token;

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected EnquiryRepository enquiries;

    /** Each call looks like a different visitor, so the per-IP rate limiters don't interfere between tests. */
    protected static RequestPostProcessor newIp() {
        int n = IP.incrementAndGet();
        return r -> { r.setRemoteAddr("10.1." + (n / 250) + "." + (n % 250)); return r; };
    }

    protected String token() {
        if (token == null) {
            try {
                String body = mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON)
                                .content("{\"username\":\"admin\",\"password\":\"" + ADMIN_PASSWORD + "\"}"))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
                token = json.readTree(body).get("token").asText();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
        return token;
    }

    protected RequestPostProcessor admin() {
        String t = token();
        return r -> { r.addHeader("Authorization", "Bearer " + t); return r; };
    }

    protected String toJson(Object o) throws Exception { return json.writeValueAsString(o); }

    protected JsonNode read(String s) throws Exception { return json.readTree(s); }

    /** Inserts an enquiry directly with a chosen creation time (for date-range tests). */
    protected Enquiry saveEnquiry(String name, String phone, LocalDateTime at, String channel, String status) {
        Enquiry e = new Enquiry();
        e.setName(name);
        e.setPhone(phone);
        e.setDistrict("Tumakuru");
        e.setType("request");
        e.setMessage("Message from " + name);
        e.setChannel(channel);
        e.setStatus(status);
        e.setLang("en");
        e.setCreatedAt(at);
        return enquiries.save(e);
    }

    protected static Map<String, Object> validEnquiry(String channel) {
        return new java.util.HashMap<>(Map.of(
                "name", "Ramesh Kumar",
                "phone", "9845012345",
                "email", "ramesh@example.com",
                "district", "Tumakuru",
                "type", "request",
                "subject", "Hostel admission",
                "message", "Please share hostel details.",
                "channel", channel,
                "lang", "en"));
    }
}
