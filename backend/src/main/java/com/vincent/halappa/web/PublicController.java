package com.vincent.halappa.web;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.common.RateLimiter;
import com.vincent.halappa.domain.*;
import com.vincent.halappa.service.EnquiryService;
import com.vincent.halappa.service.SettingsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Read-only content for the public site, plus the contact form. */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicController {

    private final SettingsService settings;
    private final PostRepository posts;
    private final GalleryItemRepository gallery;
    private final TimelineEntryRepository timeline;
    private final EnquiryService enquiries;
    private final RateLimiter enquiryLimiter = new RateLimiter(6, 10 * 60_000);

    private static final Sort NEWEST = Sort.by(Sort.Order.desc("publishedOn"), Sort.Order.desc("id"));

    @GetMapping("/settings")
    public Map<String, String> settings() { return settings.all(); }

    @GetMapping("/posts")
    public PageDto<Post> posts(@RequestParam(required = false) String section,
                               @RequestParam(required = false) String category,
                               @RequestParam(defaultValue = "0") int page,
                               @RequestParam(defaultValue = "12") int size) {
        var pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 50), NEWEST);
        if (section == null || section.isBlank()) return PageDto.of(posts.findAll(pr));
        if (category == null || category.isBlank()) return PageDto.of(posts.findBySection(section, pr));
        return PageDto.of(posts.findBySectionAndCategory(section, category, pr));
    }

    @GetMapping("/posts/{id}")
    public Post post(@PathVariable Long id) {
        return posts.findById(id).orElseThrow(() -> ApiException.notFound("Post"));
    }

    @GetMapping("/gallery")
    public List<GalleryItem> gallery(@RequestParam(required = false) String category) {
        Sort s = Sort.by(Sort.Direction.DESC, "id");
        return category == null || category.isBlank() ? gallery.findAll(s) : gallery.findByCategory(category, s);
    }

    @GetMapping("/timeline")
    public List<TimelineEntry> timeline() { return timeline.findAllByOrderBySortOrderAscIdAsc(); }

    @PostMapping("/enquiries")
    @ResponseStatus(HttpStatus.CREATED)
    public EnquiryService.Created enquire(@Valid @RequestBody EnquiryService.EnquiryRequest body, HttpServletRequest req) {
        if (!enquiryLimiter.allow(req.getRemoteAddr()))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many messages. Please try again in a few minutes.");
        return enquiries.create(body);
    }
}
