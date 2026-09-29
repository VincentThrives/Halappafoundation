package com.vincent.halappa.web;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.Enquiry;
import com.vincent.halappa.service.EnquiryFilter;
import com.vincent.halappa.service.EnquiryService;
import com.vincent.halappa.service.ExcelService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/enquiries")
@RequiredArgsConstructor
public class AdminEnquiryController {

    private final EnquiryService enquiries;
    private final ExcelService excel;

    @GetMapping
    public PageDto<Enquiry> list(@RequestParam(required = false) String q,
                                 @RequestParam(required = false) String status,
                                 @RequestParam(required = false) String channel,
                                 @RequestParam(required = false) String type,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                 @RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "25") int size) {
        return PageDto.of(enquiries.search(new EnquiryFilter(q, status, channel, type, from, to, null), page, size));
    }

    @GetMapping("/stats")
    public Map<String, Long> stats() { return enquiries.stats(); }

    public record Update(String status, String notes) {}

    @PatchMapping("/{id}")
    public Enquiry update(@PathVariable Long id, @RequestBody Update u) { return enquiries.update(id, u.status(), u.notes()); }

    public record Ids(List<Long> ids) {}

    @PostMapping("/delete")
    public Map<String, Integer> delete(@RequestBody Ids body) {
        enquiries.delete(body.ids());
        return Map.of("deleted", body.ids().size());
    }

    /**
     * Downloads enquiries as .xlsx: all=true for everything, ids=1,2,3 for a selection,
     * otherwise everything matching the filters (from/to are inclusive dates).
     */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(required = false) String q,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String channel,
                                         @RequestParam(required = false) String type,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                         @RequestParam(required = false) List<Long> ids,
                                         @RequestParam(defaultValue = "false") boolean all) {
        if (from != null && to != null && from.isAfter(to)) throw ApiException.badRequest("From date must be on or before To date");
        EnquiryFilter f = all ? new EnquiryFilter(null, null, null, null, null, null, null)
                              : new EnquiryFilter(q, status, channel, type, from, to, ids);

        DateTimeFormatter show = DateTimeFormatter.ofPattern("dd-MM-yyyy");
        String label, suffix;
        if (all) { label = "All enquiries"; suffix = "ALL"; }
        else if (ids != null && !ids.isEmpty()) { label = ids.size() + " selected enquiries"; suffix = "selected-" + LocalDate.now(); }
        else if (from != null || to != null) {
            label = (from != null ? from.format(show) : "beginning") + " to " + (to != null ? to.format(show) : "today");
            suffix = (from != null ? from.toString() : "start") + "_to_" + (to != null ? to.toString() : LocalDate.now().toString());
        } else { label = "Filtered enquiries"; suffix = LocalDate.now().toString(); }

        byte[] bytes = excel.enquiries(enquiries.all(f), label);
        String name = "halappa-enquiries_" + suffix + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(bytes);
    }
}
