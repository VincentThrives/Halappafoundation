package com.vincent.halappa.web;

import com.vincent.halappa.common.PageDto;
import com.vincent.halappa.domain.WalletRates;
import com.vincent.halappa.domain.WalletTxn;
import com.vincent.halappa.service.WalletService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Super admin only (see SecurityConfig): recharge wallets, set prices per message, see everyone's audit log. */
@RestController
@RequestMapping("/api/super")
@RequiredArgsConstructor
public class SuperAdminController {

    private final WalletService wallet;

    /** Amount in rupees as typed, e.g. "500" or "0.80". */
    public record Money(String amount, String note) {}

    /** Prices per message in rupees. */
    public record Rates(String whatsapp, String sms, String email) {}

    @GetMapping("/admins")
    public List<WalletService.Admin> admins() { return wallet.admins(); }

    @PostMapping("/admins/{username}/recharge")
    public WalletTxn recharge(@PathVariable String username, @RequestBody Money m, Authentication auth) {
        return wallet.recharge(username, WalletService.toPaise(m.amount()), m.note(), auth.getName());
    }

    @PostMapping("/admins/{username}/deduct")
    public WalletTxn deduct(@PathVariable String username, @RequestBody Money m, Authentication auth) {
        return wallet.deduct(username, WalletService.toPaise(m.amount()), m.note(), auth.getName());
    }

    @GetMapping("/rates")
    public WalletRates rates() { return wallet.rates(); }

    @PutMapping("/rates")
    public WalletRates setRates(@RequestBody Rates r, Authentication auth) {
        return wallet.setRates(paise(r.whatsapp()), paise(r.sms()), paise(r.email()), auth.getName());
    }

    /** Everyone's wallet audit log, newest first, filterable by admin, type and dates (inclusive). */
    @GetMapping("/audit")
    public PageDto<WalletTxn> audit(@RequestParam(required = false) String admin,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        return wallet.log(admin, type, from, to, page, size);
    }

    private static long paise(String rupees) { return rupees == null || rupees.isBlank() ? 0 : WalletService.toPaise(rupees); }
}
