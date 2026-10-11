package com.vincent.halappa.domain;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface GalleryItemRepository extends MongoRepository<GalleryItem, Long> {
    List<GalleryItem> findByCategory(String category, Sort sort);
}
