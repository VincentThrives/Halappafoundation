package com.vincent.halappa.common;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.support.PageableExecutionUtils;

import java.util.List;
import java.util.regex.Pattern;

/** Small helpers for filtered MongoDB searches. */
public final class MongoQueries {

    private MongoQueries() {}

    /** Any of the fields contains {@code text}, ignoring case (the text is matched literally, not as a regex). */
    public static Criteria containsAny(String text, String... fields) {
        Pattern p = Pattern.compile(Pattern.quote(text.trim()), Pattern.CASE_INSENSITIVE);
        return new Criteria().orOperator(java.util.Arrays.stream(fields).map(f -> Criteria.where(f).regex(p)).toList());
    }

    /** AND of the given conditions (matches everything when there are none). */
    public static Criteria all(List<Criteria> cs) {
        return cs.isEmpty() ? new Criteria() : new Criteria().andOperator(cs);
    }

    public static <T> Page<T> page(MongoOperations mongo, Criteria c, Pageable p, Class<T> type) {
        Query q = Query.query(c).with(p);
        List<T> items = mongo.find(q, type);
        return PageableExecutionUtils.getPage(items, p, () -> mongo.count(Query.query(c), type));
    }

    public static <T> List<T> list(MongoOperations mongo, Criteria c, Sort sort, Class<T> type) {
        return mongo.find(Query.query(c).with(sort), type);
    }
}
