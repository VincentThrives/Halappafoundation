package com.vincent.halappa.domain;

import org.springframework.context.annotation.Lazy;
import org.springframework.data.mongodb.core.mapping.event.BeforeConvertCallback;
import org.springframework.stereotype.Component;

/** Gives new {@link Sequenced} documents the next id of their collection before they are saved. */
@Component
public class SequenceIdCallback implements BeforeConvertCallback<Object> {

    private final SequenceService sequences;

    public SequenceIdCallback(@Lazy SequenceService sequences) { this.sequences = sequences; }

    @Override
    public Object onBeforeConvert(Object entity, String collection) {
        if (entity instanceof Sequenced s && s.getId() == null) s.setId(sequences.next(collection));
        return entity;
    }
}
