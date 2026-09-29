package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** One bulk send (WhatsApp, email or SMS), e.g. "Kit distribution – Madhugiri". Each recipient is a {@link Message}. */
@Entity
@Table(name = "campaigns")
@Getter @Setter
public class Campaign {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    /** whatsapp | email | sms */
    @Column(nullable = false, length = 10)
    private String channel;

    /** api (automatic) | manual (wa.me links, WhatsApp only) */
    @Column(nullable = false, length = 10)
    private String mode;

    @Column(length = 300)
    private String subject;
    @Column(length = 4000)
    private String message;
    @Column(length = 120)
    private String template;
    @Column(length = 10)
    private String templateLang;

    /** none | auto | excel | fixed */
    @Column(length = 10)
    private String voucherMode = "none";
    @Column(length = 60)
    private String voucherInfo;

    private int total;

    /** running | paused | done | cancelled | manual */
    @Column(nullable = false, length = 12)
    private String status;

    @Column(length = 80)
    private String createdBy;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime finishedAt;
}
