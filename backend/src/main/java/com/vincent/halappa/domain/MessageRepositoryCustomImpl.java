package com.vincent.halappa.domain;

import com.vincent.halappa.common.MongoQueries;
import lombok.RequiredArgsConstructor;
import org.bson.Document;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.aggregation.BooleanOperators;
import org.springframework.data.mongodb.core.aggregation.ComparisonOperators;
import org.springframework.data.mongodb.core.aggregation.ConditionalOperators;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

import java.util.*;

import static org.springframework.data.mongodb.core.aggregation.Aggregation.*;
import static org.springframework.data.mongodb.core.query.Criteria.where;

@RequiredArgsConstructor
class MessageRepositoryCustomImpl implements MessageRepositoryCustom {

    private final MongoTemplate mongo;

    @Override
    public Map<String, Long> statusCounts(Long campaignId) {
        var agg = newAggregation(match(where("campaignId").is(campaignId)), group("status").count().as("n"));
        Map<String, Long> out = new HashMap<>();
        mongo.aggregate(agg, Message.class, Document.class)
                .forEach(d -> out.put(d.getString("_id"), ((Number) d.get("n")).longValue()));
        return out;
    }

    @Override
    public List<String> existingVouchers(Collection<String> codes) {
        return mongo.findDistinct(Query.query(where("voucher").in(codes)), "voucher", Message.class, String.class);
    }

    @Override
    public int markThreadRead(String channel, String contact) {
        return (int) mongo.updateMulti(
                Query.query(where("channel").is(channel).and("contact").is(contact).and("adminRead").is(false)),
                Update.update("adminRead", true), Message.class).getModifiedCount();
    }

    @Override
    public int deleteIncomingByProviderIds(Collection<String> providerIds) {
        return (int) mongo.remove(Query.query(where("providerId").in(providerIds).and("direction").is("in")), Message.class)
                .getDeletedCount();
    }

    @Override
    public int moveStatus(Long campaignId, String from, String to) {
        return (int) mongo.updateMulti(Query.query(where("campaignId").is(campaignId).and("status").is(from)),
                Update.update("status", to), Message.class).getModifiedCount();
    }

    @Override
    public Page<ThreadRow> threads(String channel, String q, boolean all, Pageable p) {
        List<Criteria> filters = new ArrayList<>();
        if (channel != null) filters.add(where("channel").is(channel));
        if (q != null) filters.add(MongoQueries.containsAny(q, "contact", "name", "body", "voucher"));
        Criteria match = filters.isEmpty() ? new Criteria() : new Criteria().andOperator(filters);

        List<AggregationOperation> ops = new ArrayList<>(List.of(
                match(match),
                group("channel", "contact")
                        .max("_id").as("lastId")
                        // Explicit $and: a chained Criteria here dropped the adminRead check, so opened threads stayed "unread".
                        .sum(ConditionalOperators.when(BooleanOperators.And.and(
                                ComparisonOperators.valueOf("direction").equalToValue("in"),
                                ComparisonOperators.valueOf("adminRead").equalToValue(false))).then(1).otherwise(0)).as("unread")
                        .sum(ConditionalOperators.when(where("direction").is("in")).then(1).otherwise(0)).as("received")));
        if (!all) ops.add(match(where("received").gt(0)));

        List<AggregationOperation> page = new ArrayList<>(ops);
        page.add(sort(Sort.Direction.DESC, "lastId"));
        page.add(skip(p.getOffset()));
        page.add(limit(p.getPageSize()));
        List<ThreadRow> rows = mongo.aggregate(newAggregation(page), "messages", Document.class).getMappedResults().stream()
                .map(d -> {
                    Document key = d.get("_id", Document.class);
                    return new ThreadRow(key.getString("channel"), key.getString("contact"),
                            ((Number) d.get("lastId")).longValue(), ((Number) d.get("unread")).longValue(),
                            ((Number) d.get("received")).longValue());
                }).toList();

        List<AggregationOperation> counting = new ArrayList<>(ops);
        counting.add(count().as("n"));
        Document total = mongo.aggregate(newAggregation(counting), "messages", Document.class).getUniqueMappedResult();
        return new PageImpl<>(rows, p, total == null ? 0 : ((Number) total.get("n")).longValue());
    }
}
