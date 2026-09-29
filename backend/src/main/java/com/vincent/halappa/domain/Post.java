package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Press items, "My Views" writing and "Stalwart Says" tributes. All bilingual. */
@Entity
@Table(name = "posts", indexes = @Index(columnList = "section,category"))
@Getter @Setter
public class Post {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** press | views | stalwart */
    @Column(nullable = false, length = 20)
    private String section;

    /** press: news, interviews, editorials, critic, press-releases; views: quotes, blogs, articles; stalwart: stalwart */
    @Column(nullable = false, length = 30)
    private String category;

    @Column(nullable = false, length = 300)
    private String titleEn;
    @Column(length = 300)
    private String titleKn;

    @Column(length = 20000)
    private String bodyEn;
    @Column(length = 20000)
    private String bodyKn;

    @Column(length = 150)
    private String author;
    private String image;
    @Column(length = 500)
    private String sourceUrl;

    private LocalDate publishedOn = LocalDate.now();
    private LocalDateTime createdAt = LocalDateTime.now();
}
