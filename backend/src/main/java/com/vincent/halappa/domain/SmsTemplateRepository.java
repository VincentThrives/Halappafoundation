package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface SmsTemplateRepository extends MongoRepository<SmsTemplate, Long> {
    List<SmsTemplate> findAllByOrderByNameAsc();
}
