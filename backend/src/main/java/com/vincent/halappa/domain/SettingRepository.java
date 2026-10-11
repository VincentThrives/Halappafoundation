package com.vincent.halappa.domain;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface SettingRepository extends MongoRepository<Setting, String> {}
