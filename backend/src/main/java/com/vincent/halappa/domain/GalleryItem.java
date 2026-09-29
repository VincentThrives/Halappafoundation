package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "gallery_items")
@Getter @Setter
public class GalleryItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** timeline | lighter-side | election-rally | government-events | spiritual-side */
    @Column(nullable = false, length = 30)
    private String category;

    @Column(length = 300)
    private String captionEn;
    @Column(length = 300)
    private String captionKn;

    @Column(nullable = false)
    private String image;

    private LocalDateTime createdAt = LocalDateTime.now();
}
