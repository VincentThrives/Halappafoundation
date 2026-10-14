package com.vincent.halappa.service;

import com.mongodb.client.gridfs.model.GridFSFile;
import com.vincent.halappa.common.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

/**
 * Uploaded photos live in MongoDB (GridFS: raw bytes in fs.files / fs.chunks, not base64), so they survive restarts and
 * deploys on hosts without a permanent disk (Render free). Records keep a short "/uploads/&lt;name&gt;" link, served by
 * UploadsController. Large JPG/PNG photos are shrunk on upload. Files from the old disk folder (app.uploads-dir) are
 * still served when they exist.
 */
@Slf4j
@Service
public class FileStorageService {

    private static final Map<String, String> ALLOWED = Map.of(
            "image/jpeg", ".jpg", "image/png", ".png", "image/webp", ".webp", "image/gif", ".gif");
    private static final Map<String, String> TYPES = Map.of(
            "jpg", "image/jpeg", "png", "image/png", "webp", "image/webp", "gif", "image/gif");
    /** Only names we create ourselves: 32 hex characters + a known extension. */
    private static final Pattern NAME = Pattern.compile("[a-f0-9]{32}\\.(jpg|png|webp|gif)");
    /** Longest side after shrinking; plenty for full-screen gallery views. */
    static final int MAX_SIDE = 1600;
    /** JPGs bigger than this are re-saved at a lower quality even when they are small enough in pixels. */
    static final long RECOMPRESS_ABOVE = 500 * 1024;

    public record Stored(byte[] bytes, String contentType) {}

    private final GridFsTemplate gridFs;
    private final Path dir;

    public FileStorageService(GridFsTemplate gridFs, @Value("${app.uploads-dir}") String uploadsDir) {
        this.gridFs = gridFs;
        this.dir = Path.of(uploadsDir).toAbsolutePath().normalize();
    }

    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        String ext = ALLOWED.get(file.getContentType());
        if (ext == null) throw ApiException.badRequest("Only JPG, PNG, WEBP or GIF images are allowed");
        String name = UUID.randomUUID().toString().replace("-", "") + ext;
        try {
            byte[] bytes = shrink(file.getBytes(), file.getContentType());
            gridFs.store(new ByteArrayInputStream(bytes), name, file.getContentType());
        } catch (IOException e) {
            throw new IllegalStateException("Could not save upload", e);
        }
        return "/uploads/" + name;
    }

    /** The stored photo for a "/uploads/&lt;name&gt;" link: MongoDB first, then the old disk folder. */
    public Optional<Stored> find(String name) {
        if (name == null || !NAME.matcher(name).matches()) return Optional.empty();
        String type = TYPES.get(name.substring(name.lastIndexOf('.') + 1));
        GridFSFile f = gridFs.findOne(query(where("filename").is(name)));
        if (f != null) {
            GridFsResource r = gridFs.getResource(f);
            try (InputStream in = r.getInputStream()) {
                return Optional.of(new Stored(in.readAllBytes(), type));
            } catch (IOException e) {
                log.warn("Could not read stored photo {}: {}", name, e.getMessage());
                return Optional.empty();
            }
        }
        Path p = dir.resolve(name).normalize();
        try {
            return p.startsWith(dir) && Files.isRegularFile(p) ? Optional.of(new Stored(Files.readAllBytes(p), type)) : Optional.empty();
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    /** Deletes a photo we stored earlier. Seeded /img/... paths and anything else are left alone. */
    public void delete(String publicPath) {
        if (publicPath == null || !publicPath.startsWith("/uploads/")) return;
        String name = publicPath.substring("/uploads/".length());
        if (!NAME.matcher(name).matches()) return;
        gridFs.delete(query(where("filename").is(name)));
        Path p = dir.resolve(name).normalize();
        if (!p.startsWith(dir)) return;
        try { Files.deleteIfExists(p); } catch (IOException ignored) { }
    }

    /**
     * Makes big JPG/PNG photos smaller: longest side at most {@link #MAX_SIDE}, JPG re-saved at quality 0.82.
     * GIF/WEBP, unreadable files and anything that would not get smaller are kept exactly as uploaded.
     */
    static byte[] shrink(byte[] original, String type) {
        boolean jpg = "image/jpeg".equals(type), png = "image/png".equals(type);
        if (!jpg && !png) return original;
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(original));
            if (img == null) return original;
            int w = img.getWidth(), h = img.getHeight();
            boolean tooBig = Math.max(w, h) > MAX_SIDE;
            if (!tooBig && !(jpg && original.length > RECOMPRESS_ABOVE)) return original;
            double scale = tooBig ? (double) MAX_SIDE / Math.max(w, h) : 1;
            int nw = Math.max(1, (int) Math.round(w * scale)), nh = Math.max(1, (int) Math.round(h * scale));
            BufferedImage out = new BufferedImage(nw, nh, jpg ? BufferedImage.TYPE_INT_RGB : BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            if (jpg) { g.setColor(Color.WHITE); g.fillRect(0, 0, nw, nh); }
            g.drawImage(img, 0, 0, nw, nh, null);
            g.dispose();
            byte[] smaller = jpg ? writeJpg(out, 0.82f) : writePng(out);
            return smaller.length < original.length ? smaller : original;
        } catch (Exception e) {
            return original; // never block an upload because shrinking failed
        }
    }

    private static byte[] writeJpg(BufferedImage img, float quality) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(bos)) {
            writer.setOutput(ios);
            ImageWriteParam p = writer.getDefaultWriteParam();
            p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            p.setCompressionQuality(quality);
            writer.write(null, new IIOImage(img, null, null), p);
        } finally {
            writer.dispose();
        }
        return bos.toByteArray();
    }

    private static byte[] writePng(BufferedImage img) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", bos);
        return bos.toByteArray();
    }
}
