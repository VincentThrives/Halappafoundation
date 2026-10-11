package com.vincent.halappa.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/** Bulk updates and aggregations on messages (implemented with MongoTemplate in {@link MessageRepositoryCustomImpl}). */
public interface MessageRepositoryCustom {

    /** Number of a campaign's messages per status. */
    Map<String, Long> statusCounts(Long campaignId);

    /** Which of these voucher codes have already been issued. */
    List<String> existingVouchers(Collection<String> codes);

    int markThreadRead(String channel, String contact);

    int deleteIncomingByProviderIds(Collection<String> providerIds);

    int moveStatus(Long campaignId, String from, String to);

    /** One conversation per (channel, contact). */
    record ThreadRow(String channel, String contact, long lastId, long unread, long received) {}

    /** Conversations, newest first. {@code q} matches contact, name, body or voucher (case-insensitive). */
    Page<ThreadRow> threads(String channel, String q, boolean all, Pageable p);
}
