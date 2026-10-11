package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document("admin_users")
@Getter @Setter
public class AdminUser implements Sequenced {
    @Id
    private Long id;

    @Indexed(unique = true)
    private String username;

    private String passwordHash;

    private LocalDateTime createdAt = LocalDateTime.now();
}
