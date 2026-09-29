package com.vincent.halappa.config;

import com.vincent.halappa.domain.*;
import com.vincent.halappa.service.SettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** First-boot seed. Content comes only from Muralidhar Halappa's official bio. */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final AdminUserRepository admins;
    private final PostRepository posts;
    private final TimelineEntryRepository timeline;
    private final GalleryItemRepository gallery;
    private final SettingsService settings;
    private final PasswordEncoder encoder;

    @Value("${app.seed.admin-username:admin}") private String adminUser;
    @Value("${app.seed.admin-password:}") private String adminPassword;

    @Override
    public void run(String... args) {
        settings.ensureDefaults();

        if (admins.count() == 0) {
            String pw = adminPassword;
            boolean generated = pw == null || pw.isBlank();
            if (generated) pw = randomPassword();
            AdminUser a = new AdminUser();
            a.setUsername(adminUser);
            a.setPasswordHash(encoder.encode(pw));
            admins.save(a);
            if (generated) {
                // Shown once, only in this server's own log. There is no password default in the code.
                log.warn("Created admin '{}' with one-time password: {}  (set SEED_ADMIN_PASSWORD to choose it; change it after signing in)", adminUser, pw);
            } else {
                log.info("Seeded admin user '{}'. Change the password after first login.", adminUser);
            }
        }

        if (timeline.count() == 0) seedTimeline();
        if (posts.count() == 0) seedArticles();
        if (gallery.count() == 0) {
            gallery.save(photo("government-events", "At work", "ಕಾರ್ಯನಿರತ", "/img/office.jpg"));
            gallery.save(photo("timeline", "Muralidhar Halappa", "ಮುರಳೀಧರ ಹಾಲಪ್ಪ", "/img/portrait.jpg"));
        }
    }

    private void seedTimeline() {
        String[][] rows = {
            {"Roots", "Born in Midigeshi, Madhugiri Taluk", "ಮಧುಗಿರಿ ತಾಲ್ಲೂಕಿನ ಮಿಡಿಗೇಶಿಯಲ್ಲಿ ಜನನ",
                "Son of Dr. Halappa, a renowned medical doctor and President of the Theosophical Federation.",
                "ಖ್ಯಾತ ವೈದ್ಯರು ಹಾಗೂ ಥಿಯೊಸಾಫಿಕಲ್ ಫೆಡರೇಷನ್ ಅಧ್ಯಕ್ಷರಾಗಿದ್ದ ಡಾ. ಹಾಲಪ್ಪ ಅವರ ಪುತ್ರ."},
            {"Education", "B.E., Bangalore Institute of Technology", "ಬಿ.ಇ., ಬೆಂಗಳೂರು ಇನ್‌ಸ್ಟಿಟ್ಯೂಟ್ ಆಫ್ ಟೆಕ್ನಾಲಜಿ",
                "Graduated in engineering from BIT, Bengaluru.", "ಬೆಂಗಳೂರಿನ ಬಿಐಟಿಯಿಂದ ಎಂಜಿನಿಯರಿಂಗ್ ಪದವಿ."},
            {"Past", "Founder Secretary, Heritage Academy", "ಸಂಸ್ಥಾಪಕ ಕಾರ್ಯದರ್ಶಿ, ಹೆರಿಟೇಜ್ ಅಕಾಡೆಮಿ",
                "Helped found Heritage Academy, which he now leads as Chairman.",
                "ಹೆರಿಟೇಜ್ ಅಕಾಡೆಮಿಯ ಸ್ಥಾಪನೆಯಲ್ಲಿ ಪ್ರಮುಖ ಪಾತ್ರ; ಇಂದು ಅದರ ಅಧ್ಯಕ್ಷರು."},
            {"Past", "Past President, Rotary Club Bangalore South", "ಮಾಜಿ ಅಧ್ಯಕ್ಷರು, ರೋಟರಿ ಕ್ಲಬ್ ಬೆಂಗಳೂರು ದಕ್ಷಿಣ",
                "Led community service projects through Rotary.", "ರೋಟರಿ ಮೂಲಕ ಸಮಾಜ ಸೇವಾ ಯೋಜನೆಗಳ ನೇತೃತ್ವ."},
            {"Past", "Chairman, Skill Development Corporation, Govt. of Karnataka", "ಅಧ್ಯಕ್ಷರು, ಕೌಶಲ್ಯಾಭಿವೃದ್ಧಿ ನಿಗಮ, ಕರ್ನಾಟಕ ಸರ್ಕಾರ",
                "Introduced skill development programmes for youth empowerment.",
                "ಯುವ ಸಬಲೀಕರಣಕ್ಕಾಗಿ ಕೌಶಲ್ಯಾಭಿವೃದ್ಧಿ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ಜಾರಿಗೆ ತಂದರು."},
            {"12+ years", "President, Kunchitiga Vokkaliga Community", "ಅಧ್ಯಕ್ಷರು, ಕುಂಚಿಟಿಗ ಒಕ್ಕಲಿಗ ಸಮುದಾಯ",
                "Leading a community of 42 lakh+ members across Karnataka, Tamil Nadu, Andhra Pradesh and Telangana.",
                "ಕರ್ನಾಟಕ, ತಮಿಳುನಾಡು, ಆಂಧ್ರಪ್ರದೇಶ ಮತ್ತು ತೆಲಂಗಾಣದ 42 ಲಕ್ಷಕ್ಕೂ ಹೆಚ್ಚು ಸದಸ್ಯರ ಸಮುದಾಯದ ನೇತೃತ್ವ."},
            {"Present", "Vice President & Spokesperson, KPCC", "ಉಪಾಧ್ಯಕ್ಷರು ಮತ್ತು ವಕ್ತಾರರು, ಕೆಪಿಸಿಸಿ",
                "Vice President and Spokesperson of the Karnataka Pradesh Congress Committee.",
                "ಕರ್ನಾಟಕ ಪ್ರದೇಶ ಕಾಂಗ್ರೆಸ್ ಸಮಿತಿಯ ಉಪಾಧ್ಯಕ್ಷರು ಹಾಗೂ ವಕ್ತಾರರು."},
            {"Present", "Convener, Election Campaigning, Tumkur", "ಸಂಚಾಲಕರು, ಚುನಾವಣಾ ಪ್ರಚಾರ, ತುಮಕೂರು",
                "Convener for Assembly and Parliament election campaigning in Tumkur. Also Executive Member, Karnataka Cricket Association.",
                "ತುಮಕೂರಿನಲ್ಲಿ ವಿಧಾನಸಭೆ ಮತ್ತು ಲೋಕಸಭೆ ಚುನಾವಣಾ ಪ್ರಚಾರದ ಸಂಚಾಲಕರು. ಕರ್ನಾಟಕ ಕ್ರಿಕೆಟ್ ಸಂಸ್ಥೆಯ ಕಾರ್ಯಕಾರಿ ಸದಸ್ಯರು."},
        };
        for (int i = 0; i < rows.length; i++) {
            TimelineEntry t = new TimelineEntry();
            t.setPeriod(rows[i][0]);
            t.setTitleEn(rows[i][1]);
            t.setTitleKn(rows[i][2]);
            t.setDescEn(rows[i][3]);
            t.setDescKn(rows[i][4]);
            t.setSortOrder(i);
            timeline.save(t);
        }
    }

    private void seedArticles() {
        String[][] rows = {
            {"Skill development for youth empowerment", "ಯುವ ಸಬಲೀಕರಣಕ್ಕಾಗಿ ಕೌಶಲ್ಯಾಭಿವೃದ್ಧಿ",
                "As Chairman of the Skill Development Corporation, Government of Karnataka, Muralidhar Halappa introduced skill development programmes aimed at empowering young people with job-ready training.\n\nThe Foundation continues this work, connecting rural youth with training that leads to real employment.",
                "ಕರ್ನಾಟಕ ಸರ್ಕಾರದ ಕೌಶಲ್ಯಾಭಿವೃದ್ಧಿ ನಿಗಮದ ಅಧ್ಯಕ್ಷರಾಗಿ ಮುರಳೀಧರ ಹಾಲಪ್ಪ ಅವರು ಯುವಜನರಿಗೆ ಉದ್ಯೋಗ ಸಿದ್ಧ ತರಬೇತಿ ನೀಡುವ ಕೌಶಲ್ಯಾಭಿವೃದ್ಧಿ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ಜಾರಿಗೆ ತಂದರು.\n\nಗ್ರಾಮೀಣ ಯುವಜನರನ್ನು ನಿಜವಾದ ಉದ್ಯೋಗಕ್ಕೆ ಕೊಂಡೊಯ್ಯುವ ತರಬೇತಿಯೊಂದಿಗೆ ಸಂಪರ್ಕಿಸುವ ಈ ಕಾರ್ಯವನ್ನು ಪ್ರತಿಷ್ಠಾನ ಮುಂದುವರಿಸುತ್ತಿದೆ."},
            {"Awareness workshops: 'Scope & Opportunities'", "ಜಾಗೃತಿ ಕಾರ್ಯಾಗಾರಗಳು: 'ಅವಕಾಶಗಳು ಮತ್ತು ಸಾಧ್ಯತೆಗಳು'",
                "Students often don't know what comes next after 10th, PUC, ITI, Diploma or a Degree. The Foundation conducts awareness workshops on 'Scope & Opportunities' at each of these levels so that no student chooses a path blindly.",
                "10ನೇ ತರಗತಿ, ಪಿಯುಸಿ, ಐಟಿಐ, ಡಿಪ್ಲೊಮಾ ಅಥವಾ ಪದವಿಯ ನಂತರ ಮುಂದೇನು ಎಂಬುದು ಅನೇಕ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ತಿಳಿದಿರುವುದಿಲ್ಲ. ಯಾವ ವಿದ್ಯಾರ್ಥಿಯೂ ಕುರುಡಾಗಿ ದಾರಿ ಆಯ್ಕೆ ಮಾಡದಂತೆ ಪ್ರತಿಷ್ಠಾನವು ಈ ಪ್ರತಿಯೊಂದು ಹಂತದಲ್ಲೂ 'ಅವಕಾಶಗಳು ಮತ್ತು ಸಾಧ್ಯತೆಗಳು' ಕುರಿತು ಜಾಗೃತಿ ಕಾರ್ಯಾಗಾರಗಳನ್ನು ನಡೆಸುತ್ತದೆ."},
            {"Job Melas at district headquarters", "ಜಿಲ್ಲಾ ಕೇಂದ್ರಗಳಲ್ಲಿ ಉದ್ಯೋಗ ಮೇಳಗಳು",
                "Job Melas organised at district headquarters have brought employers and job-seekers together. Every event has drawn wide acclaim and strong participation.",
                "ಜಿಲ್ಲಾ ಕೇಂದ್ರಗಳಲ್ಲಿ ಆಯೋಜಿಸಿದ ಉದ್ಯೋಗ ಮೇಳಗಳು ಉದ್ಯೋಗದಾತರು ಮತ್ತು ಉದ್ಯೋಗಾಕಾಂಕ್ಷಿಗಳನ್ನು ಒಂದೇ ವೇದಿಕೆಗೆ ತಂದಿವೆ. ಪ್ರತಿಯೊಂದು ಮೇಳವೂ ವ್ಯಾಪಕ ಮೆಚ್ಚುಗೆ ಮತ್ತು ಭಾರೀ ಭಾಗವಹಿಸುವಿಕೆ ಪಡೆದಿದೆ."},
            {"Self-employment & entrepreneurship", "ಸ್ವಉದ್ಯೋಗ ಮತ್ತು ಉದ್ಯಮಶೀಲತೆ",
                "Self-employment and entrepreneurship activities have been initiated across the region, helping young people and families build their own livelihoods.",
                "ಪ್ರದೇಶದಾದ್ಯಂತ ಸ್ವಉದ್ಯೋಗ ಮತ್ತು ಉದ್ಯಮಶೀಲತೆ ಚಟುವಟಿಕೆಗಳನ್ನು ಆರಂಭಿಸಲಾಗಿದ್ದು, ಯುವಜನರು ಮತ್ತು ಕುಟುಂಬಗಳು ತಮ್ಮದೇ ಜೀವನೋಪಾಯ ಕಟ್ಟಿಕೊಳ್ಳಲು ನೆರವಾಗುತ್ತಿವೆ."},
            {"Higher education abroad for rural students", "ಗ್ರಾಮೀಣ ವಿದ್ಯಾರ್ಥಿಗಳ ವಿದೇಶಿ ಉನ್ನತ ಶಿಕ್ಷಣಕ್ಕೆ ನೆರವು",
                "Talent is everywhere; opportunity is not. The Foundation has supported rural students in pursuing higher education abroad.",
                "ಪ್ರತಿಭೆ ಎಲ್ಲೆಡೆ ಇದೆ; ಅವಕಾಶ ಎಲ್ಲರಿಗೂ ಸಿಗುವುದಿಲ್ಲ. ಗ್ರಾಮೀಣ ವಿದ್ಯಾರ್ಥಿಗಳು ವಿದೇಶದಲ್ಲಿ ಉನ್ನತ ಶಿಕ್ಷಣ ಪಡೆಯಲು ಪ್ರತಿಷ್ಠಾನ ನೆರವು ನೀಡಿದೆ."},
            {"Hostels & community halls", "ವಿದ್ಯಾರ್ಥಿ ನಿಲಯಗಳು ಮತ್ತು ಸಮುದಾಯ ಭವನಗಳು",
                "Involved in the development of hostels and community halls for rural youth and the wider rural population.",
                "ಗ್ರಾಮೀಣ ಯುವಜನರು ಹಾಗೂ ಗ್ರಾಮೀಣ ಜನತೆಗಾಗಿ ವಿದ್ಯಾರ್ಥಿ ನಿಲಯಗಳು ಮತ್ತು ಸಮುದಾಯ ಭವನಗಳ ಅಭಿವೃದ್ಧಿಯಲ್ಲಿ ತೊಡಗಿಸಿಕೊಂಡಿದ್ದಾರೆ."},
        };
        for (String[] r : rows) {
            Post p = new Post();
            p.setSection("views");
            p.setCategory("articles");
            p.setTitleEn(r[0]);
            p.setTitleKn(r[1]);
            p.setBodyEn(r[2]);
            p.setBodyKn(r[3]);
            p.setAuthor("Muralidhar Halappa");
            posts.save(p);
        }
    }

    private static String randomPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%";
        var rnd = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 16; i++) sb.append(chars.charAt(rnd.nextInt(chars.length())));
        return sb.toString();
    }

    private static GalleryItem photo(String cat, String en, String kn, String img) {
        GalleryItem g = new GalleryItem();
        g.setCategory(cat);
        g.setCaptionEn(en);
        g.setCaptionKn(kn);
        g.setImage(img);
        return g;
    }
}
