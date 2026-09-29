package com.vincent.halappa.web;

import java.util.List;
import java.util.Map;

/** The site's fixed menu structure; content categories must be one of these. */
public final class Categories {
    private Categories() {}

    public static final Map<String, List<String>> POSTS = Map.of(
            "press", List.of("news", "interviews", "editorials", "critic", "press-releases"),
            "views", List.of("quotes", "blogs", "articles"),
            "stalwart", List.of("stalwart"));

    public static final List<String> GALLERY =
            List.of("timeline", "lighter-side", "election-rally", "government-events", "spiritual-side");

    public static boolean validPost(String section, String category) {
        return section != null && POSTS.containsKey(section) && POSTS.get(section).contains(category);
    }
}
