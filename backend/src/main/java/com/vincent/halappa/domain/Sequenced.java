package com.vincent.halappa.domain;

/** Documents with a numeric id taken from a per-collection counter (see {@link SequenceIdCallback}). */
public interface Sequenced {
    Long getId();
    void setId(Long id);
}
