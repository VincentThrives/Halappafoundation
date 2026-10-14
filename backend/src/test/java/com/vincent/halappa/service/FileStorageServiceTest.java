package com.vincent.halappa.service;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.web.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

/** Photos are stored in MongoDB (GridFS), not on the server's disk, and big ones are shrunk on upload. */
class FileStorageServiceTest extends ApiTestBase {

    @Autowired FileStorageService files;
    @Autowired GridFsTemplate gridFs;

    private static String name(String path) { return path.substring("/uploads/".length()); }

    @Test
    void storesImageInMongoAndNotOnDisk() {
        String path = files.store(new MockMultipartFile("image", "a.png", "image/png", new byte[]{1, 2, 3}));
        assertThat(path).startsWith("/uploads/").endsWith(".png");
        assertThat(gridFs.findOne(query(where("filename").is(name(path))))).isNotNull();
        assertThat(Path.of("target/test-uploads", name(path))).doesNotExist();
        assertThat(files.find(name(path)).orElseThrow().bytes()).containsExactly(1, 2, 3); // not an image: kept as is
        assertThat(files.find(name(path)).orElseThrow().contentType()).isEqualTo("image/png");
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
    void deleteRemovesStoredPhoto() {
        String path = files.store(new MockMultipartFile("image", "a.png", "image/png", new byte[]{1}));
        files.delete(path);
        assertThat(gridFs.findOne(query(where("filename").is(name(path))))).isNull();
        assertThat(files.find(name(path))).isEmpty();
    }

    @Test
    void deleteAndFindIgnoreSeededImagesAndOddNames() throws IOException {
        Path outside = Files.writeString(Path.of("target", "keep-" + System.nanoTime() + ".txt"), "x");
        files.delete("/img/logo.jpg");
        files.delete("/uploads/../" + outside.getFileName());
        files.delete(null);
        assertThat(outside).exists();
        assertThat(files.find("../" + outside.getFileName())).isEmpty();
        assertThat(files.find("probe.png")).isEmpty();
        Files.delete(outside);
    }

    @Test
    void bigPhonePhotoIsShrunkToAtMost1600PxAndMuchSmaller() throws IOException {
        byte[] big = jpg(4000, 3000);
        String path = files.store(new MockMultipartFile("image", "phone.jpg", "image/jpeg", big));
        byte[] stored = files.find(name(path)).orElseThrow().bytes();
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(stored));
        assertThat(img.getWidth()).isEqualTo(1600);
        assertThat(img.getHeight()).isEqualTo(1200);
        assertThat(stored.length).isLessThan(big.length / 2);
    }

    @Test
    void bigPngKeepsItsTypeAndShape() throws IOException {
        BufferedImage src = new BufferedImage(2400, 800, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(src, "png", bos);
        byte[] out = FileStorageService.shrink(bos.toByteArray(), "image/png");
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(out));
        assertThat(img.getWidth()).isEqualTo(1600);
        assertThat(img.getHeight()).isEqualTo(533);
    }

    @Test
    void smallPhotosAndOtherFormatsAreKeptExactly() throws IOException {
        byte[] small = jpg(800, 600);
        assertThat(small.length).isLessThan((int) FileStorageService.RECOMPRESS_ABOVE);
        assertThat(FileStorageService.shrink(small, "image/jpeg")).isSameAs(small);
        byte[] gif = {'G', 'I', 'F', '8', '9', 'a'};
        assertThat(FileStorageService.shrink(gif, "image/gif")).isSameAs(gif);
        byte[] broken = {1, 2, 3};
        assertThat(FileStorageService.shrink(broken, "image/jpeg")).isSameAs(broken);
    }

    /** A noisy photo-like JPG (noise keeps it from compressing to almost nothing). */
    private static byte[] jpg(int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Random r = new Random(1);
        for (int y = 0; y < h; y += 4) for (int x = 0; x < w; x += 4) {
            img.setRGB(x, y, r.nextInt(0xFFFFFF));
        }
        Graphics2D g = img.createGraphics();
        g.setColor(Color.ORANGE);
        g.fillOval(w / 4, h / 4, w / 2, h / 2);
        g.dispose();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", bos);
        return bos.toByteArray();
    }
}
