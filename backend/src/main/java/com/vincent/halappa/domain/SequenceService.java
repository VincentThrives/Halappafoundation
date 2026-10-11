package com.vincent.halappa.domain;

import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import static org.springframework.data.mongodb.core.query.Criteria.where;

/**
 * Numeric ids (1, 2, 3 …) per collection, kept in the "counters" collection. Keeps the API's ids,
 * enquiry reference numbers and "newest first" ordering by id.
 */
@Service
@RequiredArgsConstructor
public class SequenceService {

    private final MongoOperations mongo;

    public long next(String collection) { return reserve(collection, 1); }

    /** Reserves {@code count} consecutive ids in one round trip and returns the first one. */
    public long reserve(String collection, int count) {
        Document d = mongo.findAndModify(Query.query(where("_id").is(collection)), new Update().inc("seq", (long) count),
                FindAndModifyOptions.options().returnNew(true).upsert(true), Document.class, "counters");
        return ((Number) d.get("seq")).longValue() - count + 1;
    }
}
