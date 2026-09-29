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
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AdminUserRepository admins;
    private final PasswordEncoder encoder;
    private final JwtUtil jwt;
    private final RateLimiter loginLimiter = new RateLimiter(10, 15 * 60_000);

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record ChangePassword(@NotBlank String current, @NotBlank @Size(min = 8, max = 100) String next) {}

    @PostMapping("/login")
    public Map<String, String> login(@Valid @RequestBody LoginRequest r, HttpServletRequest req) {
        if (!loginLimiter.allow(req.getRemoteAddr()))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in 15 minutes.");
        AdminUser u = admins.findByUsername(r.username().trim())
                .filter(a -> encoder.matches(r.password(), a.getPasswordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Wrong username or password"));
        return Map.of("token", jwt.issue(u.getUsername()), "username", u.getUsername());
    }

    @GetMapping("/me")
    public Map<String, String> me(Authentication auth) { return Map.of("username", auth.getName()); }

    @PostMapping("/change-password")
    public Map<String, String> changePassword(@Valid @RequestBody ChangePassword r, Authentication auth) {
        AdminUser u = admins.findByUsername(auth.getName()).orElseThrow(() -> ApiException.notFound("User"));
        if (!encoder.matches(r.current(), u.getPasswordHash())) throw ApiException.badRequest("Current password is wrong");
        u.setPasswordHash(encoder.encode(r.next()));
        admins.save(u);
        return Map.of("message", "Password changed");
    }
}
