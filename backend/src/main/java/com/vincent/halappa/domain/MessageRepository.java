package com.vincent.halappa.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface MessageRepository extends MongoRepository<Message, Long>, MessageRepositoryCustom {

    List<Message> findTop100ByCampaignIdAndStatusOrderByIdAsc(Long campaignId, String status);

    Page<Message> findByCampaignId(Long campaignId, Pageable p);

    List<Message> findByCampaignIdOrderByIdAsc(Long campaignId);

    long countByCampaignIdAndAttendedAtIsNotNull(Long campaignId);

    Optional<Message> findFirstByProviderIdAndDirection(String providerId, String direction);

    boolean existsByProviderIdAndDirection(String providerId, String direction);

    List<Message> findByVoucherIgnoreCaseAndDirectionOrderByIdAsc(String voucher, String direction);

    List<Message> findByChannelAndContactOrderByIdAsc(String channel, String contact);

    long countByDirectionAndAdminReadFalse(String direction);
}
