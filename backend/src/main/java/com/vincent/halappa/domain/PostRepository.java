package com.vincent.halappa.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostRepository extends JpaRepository<Post, Long> {
    Page<Post> findBySection(String section, Pageable pageable);
    Page<Post> findBySectionAndCategory(String section, String category, Pageable pageable);
}
