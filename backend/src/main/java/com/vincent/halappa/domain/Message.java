package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/**
 * Every message in or out, on any channel: bulk sends, replies from the admin, messages people send
 * to the foundation (WhatsApp webhook, email inbox, SMS webhook) and Contact Us form submissions.
 */
@Document("messages")
@CompoundIndex(def = "{'campaignId': 1, 'status': 1}")
@CompoundIndex(def = "{'channel': 1, 'contact': 1}")
@Getter @Setter
public class Message implements Sequenced {
    @Id
    private Long id;

    private Long campaignId;

    /** whatsapp | email | sms | web */
    private String channel;

    /** in | out */
    private String direction;

    /** Normalised phone (919845012345) or lower-case email. */
    private String contact;

    private String name;
    @Indexed
    private String voucher;
    private String subject;
    private String body;

    /** out: queued | manual | sent | delivered | read | failed | cancelled — in: received */
    private String status;

    @Indexed
    private String providerId;
    private String error;

    /** Inbound messages the admin hasn't opened yet. */
    private boolean adminRead = true;

    private LocalDateTime attendedAt;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime updatedAt;
}
