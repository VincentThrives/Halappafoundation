package com.vincent.halappa.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TimelineEntryRepository extends JpaRepository<TimelineEntry, Long> {
    List<TimelineEntry> findAllByOrderBySortOrderAscIdAsc();
}
