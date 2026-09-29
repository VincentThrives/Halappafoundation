package com.vincent.halappa.web;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Production mode: one server serves the built Angular site (WEB_STATIC_DIR) and the API. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:halappa-static;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "app.uploads-dir=target/test-uploads",
})
@AutoConfigureMockMvc
@DisplayName("Serving the website from the API server")
class SinglePageServingTest {

    static Path site;

    @BeforeAll
    static void build() throws Exception {
        site = Files.createTempDirectory("halappa-site");
        Files.writeString(site.resolve("index.html"), "<html><body>HALAPPA-SPA</body></html>");
        Files.createDirectories(site.resolve("img"));
        Files.write(site.resolve("img/logo.jpg"), new byte[]{1, 2, 3});
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("app.web.static-dir", () -> site.toString());
    }

    @Autowired MockMvc mvc;

    @Test
    void homePage() throws Exception {
        mvc.perform(get("/index.html")).andExpect(status().isOk()).andExpect(content().string(containsString("HALAPPA-SPA")));
    }

    @Test
    void deepLinksFallBackToTheAppSoRefreshWorks() throws Exception {
        for (String url : new String[]{"/about", "/gallery/election-rally", "/admin/messages/new", "/post/12"}) {
            mvc.perform(get(url)).andExpect(status().isOk()).andExpect(content().string(containsString("HALAPPA-SPA")));
        }
    }

    @Test
    void realFilesAreServedAsThemselves() throws Exception {
        mvc.perform(get("/img/logo.jpg")).andExpect(status().isOk()).andExpect(content().bytes(new byte[]{1, 2, 3}));
    }

    @Test
    void apiIsNotSwallowedByTheFallback() throws Exception {
        mvc.perform(get("/api/public/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.phone").exists());
        mvc.perform(get("/api/admin/enquiries")).andExpect(status().isUnauthorized());
    }
}
