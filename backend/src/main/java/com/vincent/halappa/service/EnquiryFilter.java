package com.vincent.halappa.service;

import com.vincent.halappa.domain.Enquiry;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Shared filter for the enquiry list, the Excel export and bulk-WhatsApp recipient selection. */
public record EnquiryFilter(String q, String status, String channel, String type,
                            LocalDate from, LocalDate to, List<Long> ids) {

    public Specification<Enquiry> toSpec() {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (ids != null && !ids.isEmpty()) ps.add(root.get("id").in(ids));
            if (has(status)) ps.add(cb.equal(root.get("status"), status));
            if (has(channel)) ps.add(cb.equal(root.get("channel"), channel));
            if (has(type)) ps.add(cb.equal(root.get("type"), type));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from.atStartOfDay()));
            if (to != null) ps.add(cb.lessThan(root.get("createdAt"), to.plusDays(1).atStartOfDay()));
            if (has(q)) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("phone")), like),
                        cb.like(cb.lower(root.get("email")), like),
                        cb.like(cb.lower(root.get("district")), like),
                        cb.like(cb.lower(root.get("taluk")), like),
                        cb.like(cb.lower(root.get("subject")), like),
                        cb.like(cb.lower(root.get("message")), like)));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
    }

    private static boolean has(String s) { return s != null && !s.isBlank(); }
}
