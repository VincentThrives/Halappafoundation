package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/** One bulk send (WhatsApp, email or SMS), e.g. "Kit distribution – Madhugiri". Each recipient is a {@link Message}. */
@Document("campaigns")
@Getter @Setter
public class Campaign implements Sequenced {
    @Id
    private Long id;

    private String name;

    /** whatsapp | email | sms */
    private String channel;

    /** api (automatic) | manual (wa.me links, WhatsApp only) */
    private String mode;

    private String subject;
    private String message;
    private String template;
    private String templateLang;
    /** The approved template's text with {{1}}, {{2}}…, kept so the log shows what each person received. */
    private String templateBody;
    /** What fills {{1}}, {{2}}… for everyone: may contain {name} and {voucher}. Null = name, voucher. */
    private java.util.List<String> templateParams;

    /** none | auto | excel | fixed */
    private String voucherMode = "none";
    private String voucherInfo;

    private int total;

    /** running | paused | done | cancelled | manual */
    @Indexed
    private String status;

    private String createdBy;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime finishedAt;
}
