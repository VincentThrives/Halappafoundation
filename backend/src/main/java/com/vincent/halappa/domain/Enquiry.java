package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

/** A query or request from the Contact page, sent via email or WhatsApp. */
@Entity
@Table(name = "enquiries", indexes = @Index(columnList = "createdAt"))
@Getter @Setter
public class Enquiry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;
    @Column(length = 20)
    private String phone;
    @Column(length = 150)
    private String email;
    @Column(length = 80)
    private String district;
    @Column(length = 120)
    private String taluk;

    /** query | request | grievance | invitation | volunteer | other */
    @Column(length = 30)
    private String type;
    @Column(length = 200)
    private String subject;
    @Column(nullable = false, length = 4000)
    private String message;

    /** email | whatsapp */
    @Column(nullable = false, length = 20)
    private String channel;

    /** new | in-progress | resolved */
    @Column(nullable = false, length = 20)
    private String status = "new";

    @Column(length = 2000)
    private String notes;
    @Column(length = 5)
    private String lang;

    private LocalDateTime createdAt = LocalDateTime.now();
}
