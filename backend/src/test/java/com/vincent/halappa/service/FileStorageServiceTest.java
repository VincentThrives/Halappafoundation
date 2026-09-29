package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileStorageServiceTest {

    @TempDir Path dir;
    FileStorageService files;

    @BeforeEach
    void setUp() throws IOException { files = new FileStorageService(dir.toString()); }

    @Test
    void storesImageAndReturnsPublicPath() throws IOException {
        String path = files.store(new MockMultipartFile("image", "a.png", "image/png", new byte[]{1, 2, 3}));
        assertThat(path).startsWith("/uploads/").endsWith(".png");
        assertThat(Files.readAllBytes(dir.resolve(path.substring("/uploads/".length())))).containsExactly(1, 2, 3);
    }

    @Test
    void usesExtensionFromContentTypeNotFilename() {
        String path = files.store(new MockMultipartFile("image", "evil.html", "image/jpeg", new byte[]{1}));
        assertThat(path).endsWith(".jpg");
    }

    @Test
    void rejectsNonImages() {
        assertThatThrownBy(() -> files.store(new MockMultipartFile("image", "x.html", "text/html", "<script>".getBytes())))
                .isInstanceOf(ApiException.class).hasMessageContaining("Only JPG");
        assertThatThrownBy(() -> files.store(new MockMultipartFile("image", "x.svg", "image/svg+xml", "<svg/>".getBytes())))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void emptyOrMissingFileReturnsNull() {
        assertThat(files.store(null)).isNull();
        assertThat(files.store(new MockMultipartFile("image", "a.png", "image/png", new byte[0]))).isNull();
    }

    @Test
    void deleteRemovesStoredFile() {
        String path = files.store(new MockMultipartFile("image", "a.png", "image/png", new byte[]{1}));
        files.delete(path);
        assertThat(dir.resolve(path.substring("/uploads/".length()))).doesNotExist();
    }

    @Test
    void deleteIgnoresSeededImagesAndPathTraversal() throws IOException {
        Path outside = Files.writeString(dir.getParent().resolve("keep-" + System.nanoTime() + ".txt"), "x");
        files.delete("/img/logo.jpg");
        files.delete("/uploads/../" + outside.getFileName());
        files.delete(null);
        assertThat(outside).exists();
        Files.delete(outside);
    }
}
