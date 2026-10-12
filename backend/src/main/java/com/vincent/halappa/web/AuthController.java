package com.vincent.halappa.web;

import com.vincent.halappa.common.ApiException;
import com.vincent.halappa.common.RateLimiter;
import com.vincent.halappa.config.JwtUtil;
import com.vincent.halappa.domain.AdminUser;
import com.vincent.halappa.domain.AdminUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import com.vincent.halappa.service.MailService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AdminUserRepository admins;
    private final PasswordEncoder encoder;
    private final JwtUtil jwt;
    private final MailService mail;
    private final RateLimiter loginLimiter = new RateLimiter(10, 15 * 60_000);
    private final RateLimiter forgotLimiter = new RateLimiter(5, 15 * 60_000);
    private final RateLimiter resetLimiter = new RateLimiter(10, 15 * 60_000);
    private static final SecureRandom RANDOM = new SecureRandom();
    static final int CODE_MINUTES = 10, MAX_CODE_TRIES = 5;

    @Value("${app.admin.recovery-email:}") private String recoveryEmail;

    /** superAdmin = signing in on the hidden /superadmin page. Each page only accepts its own kind of account. */
    public record LoginRequest(@NotBlank String username, @NotBlank String password, Boolean superAdmin) {}
    public record ChangePassword(@NotBlank String current, @NotBlank @Size(min = 8, max = 100) String next) {}
    public record ForgotRequest(@NotBlank String username) {}
    public record ResetRequest(@NotBlank String username, @NotBlank String code, @NotBlank @Size(min = 8, max = 100) String password) {}

    @PostMapping("/login")
    public Map<String, String> login(@Valid @RequestBody LoginRequest r, HttpServletRequest req) {
        if (!loginLimiter.allow(req.getRemoteAddr()))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in 15 minutes.");
        AdminUser u = admins.findByUsername(r.username().trim())
                .filter(a -> encoder.matches(r.password(), a.getPasswordHash()))
                // The super admin signs in only at /superadmin and admins only at /admin/login; the wrong page
                // gives the same answer as a wrong password, so it doesn't reveal that a super admin exists.
                .filter(a -> a.superAdmin() == Boolean.TRUE.equals(r.superAdmin()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Wrong username or password"));
        return Map.of("token", jwt.issue(u.getUsername(), u.roleOrDefault()), "username", u.getUsername(), "role", u.roleOrDefault());
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication auth) {
        AdminUser u = admins.findByUsername(auth.getName()).orElseThrow(() -> ApiException.notFound("User"));
        return Map.of("username", u.getUsername(), "role", u.roleOrDefault(), "walletPaise", u.getWalletPaise());
    }

    @PostMapping("/change-password")
    public Map<String, String> changePassword(@Valid @RequestBody ChangePassword r, Authentication auth) {
        AdminUser u = admins.findByUsername(auth.getName()).orElseThrow(() -> ApiException.notFound("User"));
        if (!encoder.matches(r.current(), u.getPasswordHash())) throw ApiException.badRequest("Current password is wrong");
        u.setPasswordHash(encoder.encode(r.next()));
        admins.save(u);
        return Map.of("message", "Password changed");
    }

    // ---------- Forgot password: emailed 6-digit code ----------

    /**
     * Step 1: emails a 6-digit code (valid 10 minutes) to the foundation's admin recovery email.
     * The answer is the same whether or not the username exists, so it can't be used to guess usernames.
     */
    @PostMapping("/forgot")
    public Map<String, String> forgot(@Valid @RequestBody ForgotRequest r, HttpServletRequest req) {
        if (!forgotLimiter.allow(req.getRemoteAddr()))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again in 15 minutes.");
        if (!mail.enabled() || recoveryEmail == null || recoveryEmail.isBlank())
            throw ApiException.badRequest("Password reset by email isn't set up on the server yet (email/SMTP settings). Ask whoever manages the server.");
        LocalDateTime now = LocalDateTime.now();
        admins.findByUsername(r.username().trim()).ifPresent(u -> {
            // One code per minute at most; the earlier code keeps working meanwhile.
            if (u.getResetRequestedAt() != null && u.getResetRequestedAt().isAfter(now.minusSeconds(60))) return;
            String code = String.format("%06d", RANDOM.nextInt(1_000_000));
            u.setResetCodeHash(encoder.encode(code));
            u.setResetExpiresAt(now.plusMinutes(CODE_MINUTES));
            u.setResetRequestedAt(now);
            u.setResetAttempts(0);
            admins.save(u);
            try {
                mail.send(recoveryEmail, "Halappa Foundation admin: password reset code " + code,
                        "Your code to reset the admin password for '" + u.getUsername() + "' is:\n\n    " + code + "\n\n"
                                + "It works for " + CODE_MINUTES + " minutes. If you didn't ask for this, ignore this email; "
                                + "the password stays the same.\n\nHalappa Foundation website", null);
            } catch (Exception e) {
                u.setResetCodeHash(null);
                u.setResetRequestedAt(null);
                admins.save(u);
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Couldn't send the email. Try again in a few minutes.");
            }
        });
        return Map.of("message", "If that username exists, a 6-digit code has been emailed to " + mask(recoveryEmail)
                + ". It works for " + CODE_MINUTES + " minutes.");
    }

    /** Step 2: the emailed code + a new password. Wrong, used or expired codes are refused; 5 wrong tries cancel the code. */
    @PostMapping("/reset")
    public Map<String, String> reset(@Valid @RequestBody ResetRequest r, HttpServletRequest req) {
        if (!resetLimiter.allow(req.getRemoteAddr()))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in 15 minutes.");
        String bad = "The code is wrong or has expired. Ask for a new code.";
        AdminUser u = admins.findByUsername(r.username().trim()).orElseThrow(() -> ApiException.badRequest(bad));
        if (u.getResetCodeHash() == null || u.getResetExpiresAt() == null || u.getResetExpiresAt().isBefore(LocalDateTime.now()))
            throw ApiException.badRequest(bad);
        if (!encoder.matches(r.code().trim(), u.getResetCodeHash())) {
            u.setResetAttempts(u.getResetAttempts() + 1);
            if (u.getResetAttempts() >= MAX_CODE_TRIES) {
                u.setResetCodeHash(null);
                admins.save(u);
                throw ApiException.badRequest("Too many wrong codes. Ask for a new code.");
            }
            admins.save(u);
            throw ApiException.badRequest(bad);
        }
        u.setPasswordHash(encoder.encode(r.password()));
        u.setResetCodeHash(null);
        u.setResetExpiresAt(null);
        u.setResetAttempts(0);
        admins.save(u);
        return Map.of("message", "Password changed. Sign in with your new password.");
    }

    /** info@halappafoundation.in → in**@halappafoundation.in */
    static String mask(String email) {
        int at = email.indexOf('@');
        if (at < 1) return "the admin email";
        String name = email.substring(0, at);
        return name.substring(0, Math.min(2, name.length())) + "**" + email.substring(at);
    }
}
