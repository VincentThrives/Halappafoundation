package com.vincent.halappa.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CampaignRepository extends JpaRepository<Campaign, Long> {
    List<Campaign> findTop50ByOrderByIdDesc();
    List<Campaign> findByStatus(String status);
}
