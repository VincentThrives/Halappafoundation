package com.vincent.halappa.common;

import org.springframework.data.domain.Page;

import java.util.List;

/** Stable JSON shape for paged lists. */
public record PageDto<T>(List<T> items, long total, int page, int size) {
    public static <T> PageDto<T> of(Page<T> p) {
        return new PageDto<>(p.getContent(), p.getTotalElements(), p.getNumber(), p.getSize());
    }
}
