package com.vincent.halappa.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Editable site settings: contact numbers, social links, address. */
@Entity
@Table(name = "settings")
@Getter @Setter @NoArgsConstructor
public class Setting {
    @Id
    @Column(name = "setting_key", length = 60)
    private String key;

    @Column(name = "setting_value", length = 1000)
    private String value;

    public Setting(String key, String value) { this.key = key; this.value = value; }
}
