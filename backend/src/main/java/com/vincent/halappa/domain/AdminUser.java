package com.vincent.halappa.domain;

import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document("admin_users")
@Getter @Setter
public class AdminUser implements Sequenced {
    @Id
    private Long id;

    @Indexed(unique = true)
    private String username;

    private String passwordHash;

    private LocalDateTime createdAt = LocalDateTime.now();

    /** "SUPER_ADMIN" or "ADMIN" (missing = ADMIN, for accounts created before roles existed). */
    private String role;
    /** Wallet balance in paise (₹1 = 100). Recharged by the super admin, spent on WhatsApp/SMS/email sends. */
    private long walletPaise;

    public static final String SUPER_ADMIN = "SUPER_ADMIN", ADMIN = "ADMIN";

    public String roleOrDefault() { return SUPER_ADMIN.equals(role) ? SUPER_ADMIN : ADMIN; }

    public boolean superAdmin() { return SUPER_ADMIN.equals(role); }

    /** "Forgot password": hash of the emailed 6-digit code, when it stops working, wrong tries so far. */
    private String resetCodeHash;
    private LocalDateTime resetExpiresAt;
    private LocalDateTime resetRequestedAt;
    private int resetAttempts;
}
