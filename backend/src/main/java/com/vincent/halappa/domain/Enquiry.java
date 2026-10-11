package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/** A query or request from the Contact page, sent via email or WhatsApp. */
@Document("enquiries")
@Getter @Setter
public class Enquiry implements Sequenced {
    @Id
    private Long id;

    private String name;
    private String phone;
    private String email;
    private String district;
    private String taluk;

    /** query | request | grievance | invitation | volunteer | other */
    private String type;
    private String subject;
    private String message;

    /** email | whatsapp */
    private String channel;

    /** new | in-progress | resolved */
    private String status = "new";

    private String notes;
    private String lang;

    @Indexed
    private LocalDateTime createdAt = LocalDateTime.now();
}
