package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** Editable site settings: contact numbers, social links, address. */
@Document("settings")
@Getter @Setter @NoArgsConstructor
public class Setting {
    @Id
    private String key;

    private String value;

    public Setting(String key, String value) { this.key = key; this.value = value; }
}
