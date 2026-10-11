package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface AdminUserRepository extends MongoRepository<AdminUser, Long> {
    Optional<AdminUser> findByUsername(String username);
}
