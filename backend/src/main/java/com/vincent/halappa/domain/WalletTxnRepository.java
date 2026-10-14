package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface WalletTxnRepository extends MongoRepository<WalletTxn, Long> {
}
