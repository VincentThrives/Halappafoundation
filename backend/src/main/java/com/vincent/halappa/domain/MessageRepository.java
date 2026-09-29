package com.vincent.halappa.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, Long>, JpaSpecificationExecutor<Message> {

    List<Message> findTop100ByCampaignIdAndStatusOrderByIdAsc(Long campaignId, String status);

    Page<Message> findByCampaignId(Long campaignId, Pageable p);

    List<Message> findByCampaignIdOrderByIdAsc(Long campaignId);

    @Query("select m.status, count(m) from Message m where m.campaignId = :id group by m.status")
    List<Object[]> statusCounts(@Param("id") Long campaignId);

    long countByCampaignIdAndAttendedAtIsNotNull(Long campaignId);

    Optional<Message> findFirstByProviderIdAndDirection(String providerId, String direction);

    boolean existsByProviderIdAndDirection(String providerId, String direction);

    @Query("select m.voucher from Message m where m.voucher in :codes")
    List<String> existingVouchers(@Param("codes") Collection<String> codes);

    List<Message> findByVoucherIgnoreCaseAndDirectionOrderByIdAsc(String voucher, String direction);

    List<Message> findByChannelAndContactOrderByIdAsc(String channel, String contact);

    long countByDirectionAndAdminReadFalse(String direction);

    @Modifying @Transactional
    @Query("update Message m set m.adminRead = true where m.channel = :ch and m.contact = :c and m.adminRead = false")
    int markThreadRead(@Param("ch") String channel, @Param("c") String contact);

    @Modifying @Transactional
    @Query("delete from Message m where m.providerId in :ids and m.direction = 'in'")
    int deleteIncomingByProviderIds(@Param("ids") Collection<String> providerIds);

    @Modifying @Transactional
    @Query("update Message m set m.status = :to where m.campaignId = :id and m.status = :from")
    int moveStatus(@Param("id") Long campaignId, @Param("from") String from, @Param("to") String to);

    /** Conversations: one row per (channel, contact) → [channel, contact, lastId, unread, inboundCount]. */
    @Query(value = """
            select m.channel, m.contact, max(m.id),
                   sum(case when m.direction = 'in' and m.adminRead = false then 1 else 0 end),
                   sum(case when m.direction = 'in' then 1 else 0 end)
            from Message m
            where (:channel is null or m.channel = :channel)
              and (:q is null or lower(m.contact) like :q or lower(m.name) like :q or lower(m.body) like :q or lower(m.voucher) like :q)
            group by m.channel, m.contact
            having (:all = true or sum(case when m.direction = 'in' then 1 else 0 end) > 0)
            order by max(m.id) desc
            """,
            countQuery = """
            select count(distinct concat(m.channel, ':', m.contact)) from Message m
            where (:channel is null or m.channel = :channel)
              and (:q is null or lower(m.contact) like :q or lower(m.name) like :q or lower(m.body) like :q or lower(m.voucher) like :q)
              and (:all = true or exists (select 1 from Message i where i.channel = m.channel and i.contact = m.contact and i.direction = 'in'))
            """)
    Page<Object[]> threads(@Param("channel") String channel, @Param("q") String q, @Param("all") boolean all, Pageable p);
}
