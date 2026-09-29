package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "timeline_entries")
@Getter @Setter
public class TimelineEntry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Free text: a year ("2015"), a range, or a label like "Present". */
    @Column(length = 40)
    private String period;

    @Column(nullable = false, length = 300)
    private String titleEn;
    @Column(length = 300)
    private String titleKn;
    @Column(length = 2000)
    private String descEn;
    @Column(length = 2000)
    private String descKn;

    private Integer sortOrder = 0;
}
