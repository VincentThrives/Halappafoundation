package com.vincent.halappa.web;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.Message;
import com.vincent.halappa.domain.MessageRepository;
import com.vincent.halappa.service.InboxService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Admin Inbox: conversations and full log of received and sent messages on every channel, plus voucher check-in. */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminInboxController {

    private final InboxService inbox;
    private final MessageRepository messages;

    @GetMapping("/inbox/threads")
    public PageDto<InboxService.Thread> threads(@RequestParam(required = false) String channel,
                                                @RequestParam(required = false) String q,
                                                @RequestParam(defaultValue = "false") boolean includeSentOnly,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "30") int size) {
        return inbox.threads(channel, q, includeSentOnly, page, size);
    }

    @GetMapping("/inbox/thread")
    public List<Message> thread(@RequestParam String channel, @RequestParam String contact) { return inbox.thread(channel, contact); }

    @GetMapping("/inbox/unread")
    public Map<String, Long> unread() { return Map.of("unread", inbox.unread()); }

    @GetMapping("/inbox/messages")
    public PageDto<Message> log(@RequestParam(required = false) String channel,
                                @RequestParam(required = false) String direction,
                                @RequestParam(required = false) String status,
                                @RequestParam(required = false) String q,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "50") int size) {
        return inbox.log(channel, direction, status, q, from, to, page, size);
    }

    public record Reply(String channel, String contact, String subject, String text) {}

    @PostMapping("/inbox/reply")
    public InboxService.ReplyResult reply(@RequestBody Reply r) { return inbox.reply(r.channel(), r.contact(), r.subject(), r.text()); }

    // ---------- Voucher check-in at the event ----------

    @GetMapping("/vouchers")
    public List<Message> findVoucher(@RequestParam String code) {
        if (code == null || code.isBlank()) throw ApiException.badRequest("Enter a voucher number");
        return messages.findByVoucherIgnoreCaseAndDirectionOrderByIdAsc(code.trim(), "out");
    }

    @PostMapping("/vouchers/{messageId}/attend")
    public Message attend(@PathVariable Long messageId) {
        Message m = messages.findById(messageId).filter(x -> x.getVoucher() != null)
                .orElseThrow(() -> ApiException.notFound("Voucher"));
        if (m.getAttendedAt() != null)
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT, "Already checked in at " + m.getAttendedAt().withNano(0).toString().replace('T', ' '));
        m.setAttendedAt(LocalDateTime.now());
        return messages.save(m);
    }
}
