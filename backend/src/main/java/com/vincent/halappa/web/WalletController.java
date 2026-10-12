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
import java.util.LinkedHashMap;
import java.util.Map;

/** An admin's own wallet: balance, prices per message and their own audit log. */
@RestController
@RequestMapping("/api/admin/wallet")
@RequiredArgsConstructor
public class WalletController {

    private final WalletService wallet;

    @GetMapping
    public Map<String, Object> mine(Authentication auth) {
        WalletRates r = wallet.rates();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("username", auth.getName());
        m.put("superAdmin", auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN")));
        m.put("balancePaise", wallet.balance(auth.getName()));
        m.put("rates", Map.of("whatsappPaise", r.getWhatsappPaise(), "smsPaise", r.getSmsPaise(), "emailPaise", r.getEmailPaise()));
        return m;
    }

    @GetMapping("/log")
    public PageDto<WalletTxn> myLog(Authentication auth,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "50") int size) {
        return wallet.log(auth.getName(), type, from, to, page, size);
    }
}
