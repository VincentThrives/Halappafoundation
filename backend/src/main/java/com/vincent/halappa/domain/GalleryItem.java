package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document("gallery_items")
@Getter @Setter
public class GalleryItem implements Sequenced {
    @Id
    private Long id;

    /** timeline | lighter-side | election-rally | government-events | spiritual-side */
    @Indexed
    private String category;

    private String captionEn;
    private String captionKn;

    private String image;

    private LocalDateTime createdAt = LocalDateTime.now();
}
