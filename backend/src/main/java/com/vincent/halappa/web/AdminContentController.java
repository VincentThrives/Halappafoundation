package com.vincent.halappa.web;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.*;
import com.vincent.halappa.service.FileStorageService;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

/** CMS for posts (press / views / stalwart), gallery photos and the timeline. */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminContentController {

    private final PostRepository posts;
    private final GalleryItemRepository gallery;
    private final TimelineEntryRepository timeline;
    private final FileStorageService files;

    // ---------- Posts ----------

    @Getter @Setter
    public static class PostForm {
        private String section, category, titleEn, titleKn, bodyEn, bodyKn, author, sourceUrl, publishedOn;
        private boolean removeImage;
    }

    @GetMapping("/posts")
    public PageDto<Post> listPosts(@RequestParam(required = false) String section,
                                   @RequestParam(required = false) String category,
                                   @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "20") int size) {
        var pr = PageRequest.of(Math.max(page, 0), Math.min(size, 100), Sort.by(Sort.Direction.DESC, "id"));
        if (section == null || section.isBlank()) return PageDto.of(posts.findAll(pr));
        if (category == null || category.isBlank()) return PageDto.of(posts.findBySection(section, pr));
        return PageDto.of(posts.findBySectionAndCategory(section, category, pr));
    }

    @PostMapping(value = "/posts", consumes = "multipart/form-data")
    public Post createPost(@ModelAttribute PostForm f, @RequestParam(value = "image", required = false) MultipartFile image) {
        Post p = new Post();
        applyPost(p, f);
        p.setImage(files.store(image));
        return posts.save(p);
    }

    @PutMapping(value = "/posts/{id}", consumes = "multipart/form-data")
    public Post updatePost(@PathVariable Long id, @ModelAttribute PostForm f,
                           @RequestParam(value = "image", required = false) MultipartFile image) {
        Post p = posts.findById(id).orElseThrow(() -> ApiException.notFound("Post"));
        applyPost(p, f);
        if (image != null && !image.isEmpty()) {
            files.delete(p.getImage());
            p.setImage(files.store(image));
        } else if (f.isRemoveImage()) {
            files.delete(p.getImage());
            p.setImage(null);
        }
        return posts.save(p);
    }

    @DeleteMapping("/posts/{id}")
    public void deletePost(@PathVariable Long id) {
        posts.findById(id).ifPresent(p -> { files.delete(p.getImage()); posts.delete(p); });
    }

    private void applyPost(Post p, PostForm f) {
        if (!Categories.validPost(f.getSection(), f.getCategory())) throw ApiException.badRequest("Pick a valid section and category");
        if (f.getTitleEn() == null || f.getTitleEn().isBlank()) throw ApiException.badRequest("English title is required");
        p.setSection(f.getSection());
        p.setCategory(f.getCategory());
        p.setTitleEn(cap(f.getTitleEn(), 300));
        p.setTitleKn(cap(f.getTitleKn(), 300));
        p.setBodyEn(cap(f.getBodyEn(), 20000));
        p.setBodyKn(cap(f.getBodyKn(), 20000));
        p.setAuthor(cap(f.getAuthor(), 150));
        p.setSourceUrl(safeUrl(f.getSourceUrl()));
        if (f.getPublishedOn() != null && !f.getPublishedOn().isBlank()) {
            try { p.setPublishedOn(LocalDate.parse(f.getPublishedOn())); }
            catch (Exception e) { throw ApiException.badRequest("Date must be YYYY-MM-DD"); }
        }
    }

    // ---------- Gallery ----------

    @GetMapping("/gallery")
    public List<GalleryItem> listGallery(@RequestParam(required = false) String category) {
        Sort s = Sort.by(Sort.Direction.DESC, "id");
        return category == null || category.isBlank() ? gallery.findAll(s) : gallery.findByCategory(category, s);
    }

    /** Accepts several photos at once; each becomes its own gallery item with the same caption. */
    @PostMapping(value = "/gallery", consumes = "multipart/form-data")
    @Transactional
    public List<GalleryItem> addPhotos(@RequestParam String category,
                                       @RequestParam(required = false) String captionEn,
                                       @RequestParam(required = false) String captionKn,
                                       @RequestParam("images") List<MultipartFile> images) {
        if (!Categories.GALLERY.contains(category)) throw ApiException.badRequest("Unknown gallery category");
        if (images == null || images.isEmpty()) throw ApiException.badRequest("Choose at least one photo");
        return images.stream().filter(f -> !f.isEmpty()).map(img -> {
            GalleryItem g = new GalleryItem();
            g.setCategory(category);
            g.setCaptionEn(cap(captionEn, 300));
            g.setCaptionKn(cap(captionKn, 300));
            g.setImage(files.store(img));
            return gallery.save(g);
        }).toList();
    }

    public record GalleryUpdate(String category, String captionEn, String captionKn) {}

    @PutMapping("/gallery/{id}")
    public GalleryItem updatePhoto(@PathVariable Long id, @RequestBody GalleryUpdate u) {
        GalleryItem g = gallery.findById(id).orElseThrow(() -> ApiException.notFound("Photo"));
        if (u.category() != null) {
            if (!Categories.GALLERY.contains(u.category())) throw ApiException.badRequest("Unknown gallery category");
            g.setCategory(u.category());
        }
        g.setCaptionEn(cap(u.captionEn(), 300));
        g.setCaptionKn(cap(u.captionKn(), 300));
        return gallery.save(g);
    }

    @DeleteMapping("/gallery/{id}")
    public void deletePhoto(@PathVariable Long id) {
        gallery.findById(id).ifPresent(g -> { files.delete(g.getImage()); gallery.delete(g); });
    }

    // ---------- Timeline ----------

    public record TimelineForm(String period, String titleEn, String titleKn, String descEn, String descKn, Integer sortOrder) {}

    @GetMapping("/timeline")
    public List<TimelineEntry> listTimeline() { return timeline.findAllByOrderBySortOrderAscIdAsc(); }

    @PostMapping("/timeline")
    public TimelineEntry addTimeline(@RequestBody TimelineForm f) { return timeline.save(applyTimeline(new TimelineEntry(), f)); }

    @PutMapping("/timeline/{id}")
    public TimelineEntry updateTimeline(@PathVariable Long id, @RequestBody TimelineForm f) {
        TimelineEntry t = timeline.findById(id).orElseThrow(() -> ApiException.notFound("Timeline entry"));
        return timeline.save(applyTimeline(t, f));
    }

    @DeleteMapping("/timeline/{id}")
    public void deleteTimeline(@PathVariable Long id) { timeline.deleteById(id); }

    private TimelineEntry applyTimeline(TimelineEntry t, TimelineForm f) {
        if (f.titleEn() == null || f.titleEn().isBlank()) throw ApiException.badRequest("English title is required");
        t.setPeriod(cap(f.period(), 40));
        t.setTitleEn(cap(f.titleEn(), 300));
        t.setTitleKn(cap(f.titleKn(), 300));
        t.setDescEn(cap(f.descEn(), 2000));
        t.setDescKn(cap(f.descKn(), 2000));
        t.setSortOrder(f.sortOrder() == null ? 0 : f.sortOrder());
        return t;
    }

    // ---------- helpers ----------

    private static String cap(String s, int max) {
        if (s == null || s.isBlank()) return null;
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** Only http(s) links are kept, so a stored URL can never become a javascript: link. */
    private static String safeUrl(String s) {
        s = cap(s, 500);
        return s != null && (s.startsWith("https://") || s.startsWith("http://")) ? s : null;
    }
}
