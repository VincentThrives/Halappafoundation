package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface TimelineEntryRepository extends MongoRepository<TimelineEntry, Long> {
    List<TimelineEntry> findAllByOrderBySortOrderAscIdAsc();
}
