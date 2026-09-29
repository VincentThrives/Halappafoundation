package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.UUID;

/** Stores uploaded photos under app.uploads-dir and returns their public "/uploads/..." URL. */
@Service
public class FileStorageService {

    private static final Map<String, String> ALLOWED = Map.of(
            "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp", "image/gif", ".gif");

    private final Path dir;

    public FileStorageService(@Value("${app.uploads-dir}") String uploadsDir) throws IOException {
        this.dir = Path.of(uploadsDir).toAbsolutePath().normalize();
        Files.createDirectories(dir);
    }

    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        String ext = ALLOWED.get(file.getContentType());
        if (ext == null) throw ApiException.badRequest("Only JPG, PNG, WEBP or GIF images are allowed");
        String name = UUID.randomUUID().toString().replace("-", "") + ext;
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("Could not save upload", e);
        }
        return "/uploads/" + name;
    }

    /** Deletes a file we stored earlier. Seeded /img/... paths are left alone. */
    public void delete(String publicPath) {
        if (publicPath == null || !publicPath.startsWith("/uploads/")) return;
        Path p = dir.resolve(publicPath.substring("/uploads/".length())).normalize();
        if (!p.startsWith(dir)) return;
        try { Files.deleteIfExists(p); } catch (IOException ignored) { }
    }
}
