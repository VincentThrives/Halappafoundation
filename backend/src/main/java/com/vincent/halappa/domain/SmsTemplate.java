package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/**
 * A DLT-approved SMS template saved once in Settings, so bulk SMS can pick it from a list
 * instead of pasting the MSG91 template ID and text every time.
 */
@Document("sms_templates")
@Getter @Setter
public class SmsTemplate implements Sequenced {
    @Id
    private Long id;

    /** What the admin sees in the list, e.g. "General invitation". */
    private String name;
    /** MSG91 → SMS → Templates "Template ID" (e.g. 6ad492ac…). */
    private String templateId;
    /** The approved text exactly as in MSG91, with its ##variables##. */
    private String text;

    private String updatedBy;
    private LocalDateTime updatedAt = LocalDateTime.now();
}
