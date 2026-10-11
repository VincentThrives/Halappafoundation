package com.vincent.halappa.service;

import com.vincent.halappa.common.MongoQueries;
import org.springframework.data.mongodb.core.query.Criteria;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.springframework.data.mongodb.core.query.Criteria.where;

/** Shared filter for the enquiry list, the Excel export and bulk-WhatsApp recipient selection. */
public record EnquiryFilter(String q, String status, String channel, String type,
                            LocalDate from, LocalDate to, List<Long> ids) {

    public Criteria toCriteria() {
        List<Criteria> cs = new ArrayList<>();
        if (ids != null && !ids.isEmpty()) cs.add(where("id").in(ids));
        if (has(status)) cs.add(where("status").is(status));
        if (has(channel)) cs.add(where("channel").is(channel));
        if (has(type)) cs.add(where("type").is(type));
        if (from != null) cs.add(where("createdAt").gte(from.atStartOfDay()));
        if (to != null) cs.add(where("createdAt").lt(to.plusDays(1).atStartOfDay()));
        if (has(q)) cs.add(MongoQueries.containsAny(q, "name", "phone", "email", "district", "taluk", "subject", "message"));
        return MongoQueries.all(cs);
    }

    private static boolean has(String s) { return s != null && !s.isBlank(); }
}
