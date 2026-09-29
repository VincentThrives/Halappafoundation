package com.vincent.halappa.web;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DisplayName("Admin: posts, gallery, timeline, settings")
class ContentAdminApiTest extends ApiTestBase {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10};

    // ---------- Posts ----------

    @Test
    void createEditDeletePostWithImage() throws Exception {
        String res = mvc.perform(multipart("/api/admin/posts").file(new MockMultipartFile("image", "c.png", "image/png", PNG)).with(admin())
                        .param("section", "press").param("category", "news")
                        .param("titleEn", "Job Mela at Tumakuru").param("titleKn", "ತುಮಕೂರಿನಲ್ಲಿ ಉದ್ಯೋಗ ಮೇಳ")
                        .param("bodyEn", "Para one.\n\nPara two.").param("publishedOn", "2026-09-20")
                        .param("sourceUrl", "https://news.example/a"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.image", startsWith("/uploads/")))
                .andReturn().getResponse().getContentAsString();
        JsonNode post = read(res);
        long id = post.get("id").asLong();
        String image = post.get("image").asText();
        assertThat(Path.of("target/test-uploads", image.substring("/uploads/".length()))).exists();

        // Visible on the public site
        mvc.perform(get("/api/public/posts").param("section", "press").param("category", "news"))
                .andExpect(jsonPath("$.items[*].titleKn", hasItem("ತುಮಕೂರಿನಲ್ಲಿ ಉದ್ಯೋಗ ಮೇಳ")));
        mvc.perform(get(image)).andExpect(status().isOk());

        // Edit and remove the image
        mvc.perform(multipart(HttpMethod.PUT, "/api/admin/posts/" + id).with(admin())
                        .param("section", "press").param("category", "interviews").param("titleEn", "Edited").param("removeImage", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").value("interviews"))
                .andExpect(jsonPath("$.image").doesNotExist());
        assertThat(Path.of("target/test-uploads", image.substring("/uploads/".length()))).doesNotExist();

        mvc.perform(delete("/api/admin/posts/" + id).with(admin())).andExpect(status().isOk());
        mvc.perform(get("/api/public/posts/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void invalidSectionCategoryIsRejected() throws Exception {
        mvc.perform(multipart("/api/admin/posts").with(admin()).param("section", "press").param("category", "quotes").param("titleEn", "x"))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/admin/posts").with(admin()).param("section", "nope").param("category", "news").param("titleEn", "x"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void englishTitleIsRequired() throws Exception {
        mvc.perform(multipart("/api/admin/posts").with(admin()).param("section", "views").param("category", "blogs").param("titleEn", " "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("English title is required"));
    }

    @Test
    void badDateIsRejected() throws Exception {
        mvc.perform(multipart("/api/admin/posts").with(admin()).param("section", "views").param("category", "blogs")
                        .param("titleEn", "x").param("publishedOn", "20/09/2026"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void javascriptLinksAreDropped() throws Exception {
        mvc.perform(multipart("/api/admin/posts").with(admin()).param("section", "stalwart").param("category", "stalwart")
                        .param("titleEn", "Tribute").param("sourceUrl", "javascript:alert(1)"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceUrl").doesNotExist());
    }

    @Test
    void nonImageUploadIsRejected() throws Exception {
        mvc.perform(multipart("/api/admin/posts").file(new MockMultipartFile("image", "x.html", "text/html", "<script>".getBytes()))
                        .with(admin()).param("section", "views").param("category", "blogs").param("titleEn", "x"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void postsNeedLogin() throws Exception {
        mvc.perform(multipart("/api/admin/posts").param("section", "views").param("category", "blogs").param("titleEn", "x"))
                .andExpect(status().isUnauthorized());
    }

    // ---------- Gallery ----------

    @Test
    void uploadSeveralPhotosThenRecaptionAndDelete() throws Exception {
        String res = mvc.perform(multipart("/api/admin/gallery")
                        .file(new MockMultipartFile("images", "1.png", "image/png", PNG))
                        .file(new MockMultipartFile("images", "2.jpg", "image/jpeg", PNG))
                        .with(admin())
                        .param("category", "election-rally").param("captionEn", "Rally").param("captionKn", "ರ‍್ಯಾಲಿ"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andReturn().getResponse().getContentAsString();
        long id = read(res).get(0).get("id").asLong();

        mvc.perform(get("/api/public/gallery").param("category", "election-rally"))
                .andExpect(jsonPath("$[*].captionEn", everyItem(is("Rally"))));

        mvc.perform(put("/api/admin/gallery/" + id).with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("category", "spiritual-side", "captionEn", "Temple visit"))))
                .andExpect(jsonPath("$.category").value("spiritual-side"))
                .andExpect(jsonPath("$.captionEn").value("Temple visit"));

        mvc.perform(delete("/api/admin/gallery/" + id).with(admin())).andExpect(status().isOk());
    }

    @Test
    void unknownAlbumIsRejected() throws Exception {
        mvc.perform(multipart("/api/admin/gallery").file(new MockMultipartFile("images", "1.png", "image/png", PNG)).with(admin())
                        .param("category", "holidays"))
                .andExpect(status().isBadRequest());
    }

    // ---------- Timeline ----------

    @Test
    void timelineCrud() throws Exception {
        String res = mvc.perform(post("/api/admin/timeline").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("period", "2027", "titleEn", "New milestone", "titleKn", "ಹೊಸ ಮೈಲಿಗಲ್ಲು", "sortOrder", 99))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = read(res).get("id").asLong();
        mvc.perform(get("/api/public/timeline")).andExpect(jsonPath("$[-1:].titleEn", hasItem("New milestone")));
        mvc.perform(put("/api/admin/timeline/" + id).with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("titleEn", "Renamed", "sortOrder", 99))))
                .andExpect(jsonPath("$.titleEn").value("Renamed"));
        mvc.perform(post("/api/admin/timeline").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/admin/timeline/" + id).with(admin())).andExpect(status().isOk());
    }

    // ---------- Edit / delete edge cases ----------

    @Test
    void editingSomethingThatNoLongerExistsIs404() throws Exception {
        mvc.perform(multipart(HttpMethod.PUT, "/api/admin/posts/999999").with(admin())
                        .param("section", "press").param("category", "news").param("titleEn", "x"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Post not found"));
        mvc.perform(put("/api/admin/gallery/999999").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"captionEn\":\"x\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Photo not found"));
        mvc.perform(put("/api/admin/timeline/999999").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"titleEn\":\"x\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("Timeline entry not found"));
    }

    @Test
    void deletingTwiceIsHarmless() throws Exception {
        mvc.perform(delete("/api/admin/posts/999999").with(admin())).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/gallery/999999").with(admin())).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/timeline/999999").with(admin())).andExpect(status().is2xxSuccessful());
    }

    @Test
    void deletingAPostOrPhotoDeletesItsImageFile() throws Exception {
        String post = mvc.perform(multipart("/api/admin/posts").file(new MockMultipartFile("image", "c.png", "image/png", PNG)).with(admin())
                        .param("section", "views").param("category", "blogs").param("titleEn", "With image"))
                .andReturn().getResponse().getContentAsString();
        Path postImg = Path.of("target/test-uploads", read(post).get("image").asText().substring("/uploads/".length()));
        assertThat(postImg).exists();
        mvc.perform(delete("/api/admin/posts/" + read(post).get("id").asLong()).with(admin())).andExpect(status().isOk());
        assertThat(postImg).doesNotExist();

        String photos = mvc.perform(multipart("/api/admin/gallery").file(new MockMultipartFile("images", "1.png", "image/png", PNG)).with(admin())
                        .param("category", "timeline"))
                .andReturn().getResponse().getContentAsString();
        JsonNode p = read(photos).get(0);
        Path photoImg = Path.of("target/test-uploads", p.get("image").asText().substring("/uploads/".length()));
        assertThat(photoImg).exists();
        mvc.perform(delete("/api/admin/gallery/" + p.get("id").asLong()).with(admin())).andExpect(status().isOk());
        assertThat(photoImg).doesNotExist();
        mvc.perform(get(p.get("image").asText())).andExpect(status().isNotFound());
    }

    @Test
    void replacingAPostImageDeletesTheOldFile() throws Exception {
        String post = mvc.perform(multipart("/api/admin/posts").file(new MockMultipartFile("image", "a.png", "image/png", PNG)).with(admin())
                        .param("section", "views").param("category", "blogs").param("titleEn", "Replace me"))
                .andReturn().getResponse().getContentAsString();
        long id = read(post).get("id").asLong();
        Path oldImg = Path.of("target/test-uploads", read(post).get("image").asText().substring("/uploads/".length()));
        String updated = mvc.perform(multipart(HttpMethod.PUT, "/api/admin/posts/" + id).file(new MockMultipartFile("image", "b.png", "image/png", PNG)).with(admin())
                        .param("section", "views").param("category", "blogs").param("titleEn", "Replaced"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(oldImg).doesNotExist();
        assertThat(Path.of("target/test-uploads", read(updated).get("image").asText().substring("/uploads/".length()))).exists();
        // Editing without a new file keeps the current image.
        mvc.perform(multipart(HttpMethod.PUT, "/api/admin/posts/" + id).with(admin())
                        .param("section", "views").param("category", "blogs").param("titleEn", "Kept"))
                .andExpect(jsonPath("$.image").value(read(updated).get("image").asText()));
        mvc.perform(delete("/api/admin/posts/" + id).with(admin()));
    }

    @Test
    void editingAPostCanMoveItToAnotherSectionButOnlyToAValidCategory() throws Exception {
        long id = read(mvc.perform(multipart("/api/admin/posts").with(admin()).param("section", "press").param("category", "news").param("titleEn", "Move"))
                .andReturn().getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(multipart(HttpMethod.PUT, "/api/admin/posts/" + id).with(admin()).param("section", "views").param("category", "news").param("titleEn", "Move"))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart(HttpMethod.PUT, "/api/admin/posts/" + id).with(admin()).param("section", "stalwart").param("category", "stalwart").param("titleEn", "Move"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.section").value("stalwart"));
        mvc.perform(get("/api/public/posts").param("section", "stalwart")).andExpect(jsonPath("$.items[*].id", hasItem((int) id)));
        mvc.perform(get("/api/public/posts").param("section", "press").param("category", "news")).andExpect(jsonPath("$.items[*].id", not(hasItem((int) id))));
        mvc.perform(delete("/api/admin/posts/" + id).with(admin()));
    }

    @Test
    void contentEditAndDeleteNeedLogin() throws Exception {
        mvc.perform(delete("/api/admin/posts/1")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/admin/gallery/1")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/admin/timeline/1")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/gallery/1").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/timeline/1").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    // ---------- Settings ----------

    @Test
    void settingsUpdateKeepsKnownKeysOnly() throws Exception {
        mvc.perform(put("/api/admin/settings").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("facebook", "https://facebook.com/halappafoundation", "hacker", "x"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.facebook").value("https://facebook.com/halappafoundation"))
                .andExpect(jsonPath("$.hacker").doesNotExist());
        mvc.perform(get("/api/public/settings"))
                .andExpect(jsonPath("$.facebook").value("https://facebook.com/halappafoundation"));
        // restore
        mvc.perform(put("/api/admin/settings").with(admin()).contentType(MediaType.APPLICATION_JSON).content("{\"facebook\":\"\"}"));
    }

    @Test
    void settingsNeedLogin() throws Exception {
        mvc.perform(put("/api/admin/settings").contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"1\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void uploadedFilesAreServed() throws Exception {
        Files.createDirectories(Path.of("target/test-uploads"));
        Files.write(Path.of("target/test-uploads/probe.png"), PNG);
        mvc.perform(get("/uploads/probe.png")).andExpect(status().isOk());
    }
}
