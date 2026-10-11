package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Press items, "My Views" writing and "Stalwart Says" tributes. All bilingual. */
@Document("posts")
@CompoundIndex(def = "{'section': 1, 'category': 1}")
@Getter @Setter
public class Post implements Sequenced {
    @Id
    private Long id;

    /** press | views | stalwart */
    private String section;

    /** press: news, interviews, editorials, critic, press-releases; views: quotes, blogs, articles; stalwart: stalwart */
    private String category;

    private String titleEn;
    private String titleKn;

    private String bodyEn;
    private String bodyKn;

    private String author;
    private String image;
    private String sourceUrl;

    private LocalDate publishedOn = LocalDate.now();
    private LocalDateTime createdAt = LocalDateTime.now();
}
