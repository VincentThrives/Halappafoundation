package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

/** Filtered searches (see EnquiryFilter) run through MongoTemplate in EnquiryService. */
public interface EnquiryRepository extends MongoRepository<Enquiry, Long> {
    long countByStatus(String status);
    long countByChannel(String channel);
}
