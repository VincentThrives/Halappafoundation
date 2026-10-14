package com.vincent.halappa.web;

import com.vincent.halappa.domain.AdminUser;
import com.vincent.halappa.domain.AdminUserRepository;
import com.vincent.halappa.domain.MessageRepository;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** "Forgot password?" on the admin login: a 6-digit code emailed to the foundation, then a new password. */
@SpringBootTest(properties = {
        "spring.data.mongodb.database=halappa-reset",
        "app.uploads-dir=target/test-uploads",
        "app.seed.admin-username=admin",
        "app.seed.admin-password=Original@123",
        "spring.mail.host=smtp.test",
        "app.admin.recovery-email=info@halappafoundation.in",
})
@AutoConfigureMockMvc
@DisplayName("Admin password reset by emailed code")
class PasswordResetApiTest {

    @Autowired MockMvc mvc;
    @Autowired AdminUserRepository admins;
    @Autowired MessageRepository messages;
    @Autowired PasswordEncoder encoder;
    @MockBean JavaMailSender smtp;

    static final AtomicInteger IP = new AtomicInteger(1);
    final List<MimeMessage> sent = new CopyOnWriteArrayList<>();

    @BeforeEach
    void setUp() {
        sent.clear();
        reset(smtp);
        when(smtp.createMimeMessage()).thenAnswer(i -> new MimeMessage(Session.getInstance(new Properties())));
        doAnswer(i -> { MimeMessage m = i.getArgument(0); m.saveChanges(); sent.add(m); return null; }).when(smtp).send(any(MimeMessage.class));
        // Same starting point for every test: password "Original@123", no code pending
        AdminUser u = admins.findByUsername("admin").orElseThrow();
        u.setPasswordHash(encoder.encode("Original@123"));
        u.setResetCodeHash(null);
        u.setResetExpiresAt(null);
        u.setResetRequestedAt(null);
        u.setResetAttempts(0);
        admins.save(u);
    }

    /** A different visitor address each call, so the per-IP limits don't mix tests up. */
    private ResultActions call(String path, String json) throws Exception {
        int n = IP.incrementAndGet();
        return mvc.perform(post(path).with(r -> { r.setRemoteAddr("10.9." + (n / 250) + "." + (n % 250)); return r; })
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String codeFromEmail() throws Exception {
        assertThat(sent).hasSize(1);
        Matcher m = Pattern.compile("(\\d{6})").matcher(sent.get(0).getSubject());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    private String login(String password) throws Exception {
        return "{\"username\":\"admin\",\"password\":\"" + password + "\"}";
    }

    @Test
    void fullResetWithTheEmailedCode() throws Exception {
        call("/api/auth/forgot", "{\"username\":\"admin\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message", containsString("in**@halappafoundation.in")))
                .andExpect(jsonPath("$.message", containsString("10 minutes")));
        MimeMessage mail = sent.get(0);
        assertThat(mail.getAllRecipients()[0].toString()).isEqualTo("info@halappafoundation.in");
        String code = codeFromEmail();
        assertThat(mail.getContent().toString()).contains(code).contains("'admin'");
        // the code itself is never stored, only its hash
        assertThat(admins.findByUsername("admin").orElseThrow().getResetCodeHash()).doesNotContain(code);
        // and it isn't logged in the Inbox
        assertThat(messages.count()).isZero();

        call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + code + "\",\"password\":\"Brand@New456\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message", containsString("Sign in with your new password")));

        call("/api/auth/login", login("Brand@New456")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
        call("/api/auth/login", login("Original@123")).andExpect(status().isUnauthorized());
        // a code works only once
        call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + code + "\",\"password\":\"Another@789\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The code is wrong or has expired. Ask for a new code."));
    }

    @Test
    void unknownUsernameGetsTheSameAnswerButNoEmail() throws Exception {
        String known = call("/api/auth/forgot", "{\"username\":\"admin\"}").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        sent.clear();
        String unknown = call("/api/auth/forgot", "{\"username\":\"nobody\"}").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(unknown).isEqualTo(known); // can't be used to find usernames
        assertThat(sent).isEmpty();
    }

    @Test
    void wrongCodesAreRefusedAndFiveCancelTheCode() throws Exception {
        call("/api/auth/forgot", "{\"username\":\"admin\"}").andExpect(status().isOk());
        String code = codeFromEmail();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 1; i < 5; i++) {
            call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + wrong + "\",\"password\":\"Brand@New456\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("The code is wrong or has expired. Ask for a new code."));
        }
        call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + wrong + "\",\"password\":\"Brand@New456\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Too many wrong codes. Ask for a new code."));
        // even the right code no longer works; the password is unchanged
        call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + code + "\",\"password\":\"Brand@New456\"}")
                .andExpect(status().isBadRequest());
        call("/api/auth/login", login("Original@123")).andExpect(status().isOk());
    }

    @Test
    void expiredCodeIsRefused() throws Exception {
        call("/api/auth/forgot", "{\"username\":\"admin\"}").andExpect(status().isOk());
        String code = codeFromEmail();
        AdminUser u = admins.findByUsername("admin").orElseThrow();
        u.setResetExpiresAt(LocalDateTime.now().minusSeconds(1));
        admins.save(u);
        call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + code + "\",\"password\":\"Brand@New456\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The code is wrong or has expired. Ask for a new code."));
        call("/api/auth/login", login("Original@123")).andExpect(status().isOk());
    }

    @Test
    void askingAgainWithinAMinuteDoesNotSendAnotherEmail() throws Exception {
        call("/api/auth/forgot", "{\"username\":\"admin\"}").andExpect(status().isOk());
        call("/api/auth/forgot", "{\"username\":\"admin\"}").andExpect(status().isOk());
        assertThat(sent).hasSize(1); // the first code still works
    }

    @Test
    void newPasswordMustBeAtLeastEightCharacters() throws Exception {
        call("/api/auth/forgot", "{\"username\":\"admin\"}").andExpect(status().isOk());
        String code = codeFromEmail();
        call("/api/auth/reset", "{\"username\":\"admin\",\"code\":\"" + code + "\",\"password\":\"short\"}")
                .andExpect(status().isBadRequest());
        call("/api/auth/login", login("Original@123")).andExpect(status().isOk());
    }

    @Test
    void emailFailureIsReportedAndLeavesNoCodeBehind() throws Exception {
        doThrow(new org.springframework.mail.MailSendException("SMTP down")).when(smtp).send(any(MimeMessage.class));
        call("/api/auth/forgot", "{\"username\":\"admin\"}")
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Couldn't send the email. Try again in a few minutes."));
        assertThat(admins.findByUsername("admin").orElseThrow().getResetCodeHash()).isNull();
    }

    @Test
    void forgotIsLimitedPerVisitor() throws Exception {
        for (int i = 0; i < 5; i++)
            mvc.perform(post("/api/auth/forgot").with(r -> { r.setRemoteAddr("10.99.0.1"); return r; })
                    .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"nobody\"}")).andExpect(status().isOk());
        mvc.perform(post("/api/auth/forgot").with(r -> { r.setRemoteAddr("10.99.0.1"); return r; })
                .contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"nobody\"}")).andExpect(status().isTooManyRequests());
    }
}
