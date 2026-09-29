package com.vincent.halappa.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Serves uploaded photos from disk and, when WEB_STATIC_DIR is set, the built Angular app
 * with an index.html fallback so deep links like /gallery/election-rally work on refresh.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${app.uploads-dir}")
    private String uploadsDir;

    @Value("${app.web.static-dir:}")
    private String staticDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(dirUri(Path.of(uploadsDir)))
                .setCachePeriod(86400);

        if (staticDir != null && !staticDir.isBlank()) {
            Path root = Path.of(staticDir).toAbsolutePath();
            registry.addResourceHandler("/**")
                    .addResourceLocations(dirUri(root))
                    .resourceChain(true)
                    .addResolver(new PathResourceResolver() {
                        @Override
                        protected Resource getResource(String resourcePath, Resource location) throws IOException {
                            if (resourcePath.startsWith("api/")) return null;
                            Resource r = location.createRelative(resourcePath);
                            return r.exists() && r.isReadable() ? r : new FileSystemResource(root.resolve("index.html"));
                        }
                    });
        }
    }

    // Resource locations must end with "/" or files inside are not resolved.
    private static String dirUri(Path p) {
        String s = p.toAbsolutePath().toUri().toString();
        return s.endsWith("/") ? s : s + "/";
    }
}
