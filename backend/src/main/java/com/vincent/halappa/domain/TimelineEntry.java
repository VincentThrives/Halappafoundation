package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("timeline_entries")
@Getter @Setter
public class TimelineEntry implements Sequenced {
    @Id
    private Long id;

    /** Free text: a year ("2015"), a range, or a label like "Present". */
    private String period;

    private String titleEn;
    private String titleKn;
    private String descEn;
    private String descKn;

    private Integer sortOrder = 0;
}
