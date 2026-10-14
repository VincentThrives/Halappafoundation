package com.vincent.halappa.web;

import com.vincent.halappa.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** Uploaded photos at /uploads/&lt;name&gt; (stored in MongoDB). Names never change, so browsers may cache them for a year. */
@RestController
@RequiredArgsConstructor
public class UploadsController {

    private final FileStorageService files;

    @GetMapping("/uploads/{name:.+}")
    public ResponseEntity<byte[]> photo(@PathVariable String name) {
        return files.find(name)
                .map(s -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(s.contentType()))
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                        .body(s.bytes()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
