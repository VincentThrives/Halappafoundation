package com.vincent.halappa.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface PostRepository extends MongoRepository<Post, Long> {
    Page<Post> findBySection(String section, Pageable pageable);
    Page<Post> findBySectionAndCategory(String section, String category, Pageable pageable);
}
