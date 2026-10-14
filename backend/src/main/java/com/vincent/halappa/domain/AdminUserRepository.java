package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface AdminUserRepository extends MongoRepository<AdminUser, Long> {
    Optional<AdminUser> findByUsername(String username);

    boolean existsByRole(String role);

    List<AdminUser> findAllByOrderByUsernameAsc();
}
