package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface WalletRatesRepository extends MongoRepository<WalletRates, String> {
}
