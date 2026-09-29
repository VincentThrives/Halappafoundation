package com.vincent.halappa.service;

import com.vincent.halappa.domain.Setting;
import com.vincent.halappa.domain.SettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SettingsService {

    /** Every editable key with its default. Unknown keys are ignored on update. */
    public static final Map<String, String> DEFAULTS = new LinkedHashMap<>();
    static {
        DEFAULTS.put("phone", "9900123406");
        DEFAULTS.put("whatsapp", "919900123406");
        DEFAULTS.put("email", "info@halappafoundation.in");
        DEFAULTS.put("facebook", "https://www.facebook.com/share/19exAKzyMF/");
        DEFAULTS.put("instagram", "https://www.instagram.com/muralidharhalappa");
        DEFAULTS.put("youtube", "https://www.youtube.com/@muralidharhalappa");
        DEFAULTS.put("twitter", "");
        DEFAULTS.put("addressEn", "Midigeshi, Madhugiri Taluk, Tumkur District, Karnataka");
        DEFAULTS.put("addressKn", "ಮಿಡಿಗೇಶಿ, ಮಧುಗಿರಿ ತಾಲ್ಲೂಕು, ತುಮಕೂರು ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ");
        DEFAULTS.put("officeHours", "Mon to Sat, 10:00 AM to 6:00 PM");
        DEFAULTS.put("mapQuery", "Madhugiri, Tumkur, Karnataka");
    }

    private final SettingRepository repo;

    @Transactional
    public void ensureDefaults() {
        DEFAULTS.forEach((k, v) -> { if (!repo.existsById(k)) repo.save(new Setting(k, v)); });
    }

    public Map<String, String> all() {
        Map<String, String> out = new LinkedHashMap<>(DEFAULTS);
        repo.findAll().forEach(s -> { if (DEFAULTS.containsKey(s.getKey())) out.put(s.getKey(), s.getValue()); });
        return out;
    }

    public String get(String key) { return all().get(key); }

    @Transactional
    public Map<String, String> update(Map<String, String> values) {
        values.forEach((k, v) -> {
            if (DEFAULTS.containsKey(k)) repo.save(new Setting(k, v == null ? "" : v.trim()));
        });
        return all();
    }
}
