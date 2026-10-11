package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface CampaignRepository extends MongoRepository<Campaign, Long> {
    List<Campaign> findTop50ByOrderByIdDesc();
    List<Campaign> findByStatus(String status);
}
