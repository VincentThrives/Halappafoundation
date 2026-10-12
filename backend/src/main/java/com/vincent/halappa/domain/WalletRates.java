package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/** Price per message, set by the super admin (single document, id "rates"). 0 = free. */
@Document("wallet_rates")
@Getter @Setter
public class WalletRates {
    public static final String ID = "rates";

    @Id
    private String id = ID;
    private long whatsappPaise;
    private long smsPaise;
    private long emailPaise;
    private String updatedBy;
    private LocalDateTime updatedAt;

    public long forChannel(String channel) {
        return switch (channel == null ? "" : channel) {
            case "whatsapp", "web" -> whatsappPaise;
            case "sms" -> smsPaise;
            case "email" -> emailPaise;
            default -> 0;
        };
    }
}
