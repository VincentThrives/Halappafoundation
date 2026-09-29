package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Every message in or out, on any channel: bulk sends, replies from the admin, messages people send
 * to the foundation (WhatsApp webhook, email inbox, SMS webhook) and Contact Us form submissions.
 */
@Entity
@Table(name = "messages", indexes = {
        @Index(columnList = "campaignId,status"),
        @Index(columnList = "channel,contact"),
        @Index(columnList = "providerId"),
        @Index(columnList = "voucher"),
})
@Getter @Setter
public class Message {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long campaignId;

    /** whatsapp | email | sms | web */
    @Column(nullable = false, length = 10)
    private String channel;

    /** in | out */
    @Column(nullable = false, length = 3)
    private String direction;

    /** Normalised phone (919845012345) or lower-case email. */
    @Column(nullable = false, length = 150)
    private String contact;

    @Column(length = 150)
    private String name;
    @Column(length = 60)
    private String voucher;
    @Column(length = 300)
    private String subject;
    @Column(length = 4000)
    private String body;

    /** out: queued | manual | sent | delivered | read | failed | cancelled — in: received */
    @Column(nullable = false, length = 12)
    private String status;

    @Column(length = 250)
    private String providerId;
    @Column(length = 1000)
    private String error;

    /** Inbound messages the admin hasn't opened yet. */
    private boolean adminRead = true;

    private LocalDateTime attendedAt;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt;
}
