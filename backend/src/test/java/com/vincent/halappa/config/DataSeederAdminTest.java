package com.vincent.halappa.config;

import com.vincent.halappa.domain.*;
import com.vincent.halappa.service.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** The admin password is fixed: set once from SEED_ADMIN_PASSWORD, never generated, never reset by a restart or deploy. */
class DataSeederAdminTest {
    private final AdminUserRepository admins = mock(AdminUserRepository.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private DataSeeder seeder;

    @BeforeEach
    void setUp() {
        seeder = new DataSeeder(admins, mock(PostRepository.class), mock(TimelineEntryRepository.class),
                mock(GalleryItemRepository.class), mock(SettingsService.class), encoder);
        ReflectionTestUtils.setField(seeder, "adminUser", "admin");
    }

    @Test
    void firstStartCreatesTheAdminWithTheConfiguredPassword() {
        ReflectionTestUtils.setField(seeder, "adminPassword", "Chosen@Pass1");
        when(admins.findAll()).thenReturn(List.of());

        seeder.seedAdmin();

        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(admins).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
        assertThat(encoder.matches("Chosen@Pass1", saved.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void withoutAConfiguredPasswordNothingIsGeneratedOrCreated() {
        when(admins.findAll()).thenReturn(List.of());
        for (String blank : new String[] { null, "", "   " }) {
            ReflectionTestUtils.setField(seeder, "adminPassword", blank);
            seeder.seedAdmin();
        }
        verify(admins, never()).save(any());
    }

    @Test
    void redeployNeverChangesAnExistingAdmin() {
        // An admin already exists (e.g. its password was changed in Settings); SEED_ADMIN_PASSWORD now differs.
        ReflectionTestUtils.setField(seeder, "adminPassword", "Different@Pass2");
        AdminUser existing = new AdminUser(); existing.setUsername("admin");
        when(admins.findAll()).thenReturn(List.of(existing));

        seeder.seedAdmin();
        seeder.seedAdmin();

        verify(admins, never()).save(any());
        verify(admins, never()).delete(any());
        verify(admins, never()).deleteAll();
    }

    @Test
    void theSuperAdminDoesNotStopTheAdminBeingCreated() {
        ReflectionTestUtils.setField(seeder, "adminPassword", "Chosen@Pass1");
        AdminUser sup = new AdminUser(); sup.setUsername("superadmin"); sup.setRole(AdminUser.SUPER_ADMIN);
        when(admins.findAll()).thenReturn(List.of(sup));
        seeder.seedAdmin();
        verify(admins).save(any());
    }

    // ---------- SEED_ADMIN_RESET ----------

    @Test
    void resetSetsTheExistingAdminsPasswordFromTheSetting() {
        ReflectionTestUtils.setField(seeder, "adminReset", true);
        ReflectionTestUtils.setField(seeder, "adminPassword", "Admin@2026");
        AdminUser existing = new AdminUser(); existing.setUsername("admin");
        existing.setPasswordHash(encoder.encode("Forgotten@1")); existing.setResetCodeHash("x");
        when(admins.findByUsername("admin")).thenReturn(java.util.Optional.of(existing));

        seeder.seedAdmin();

        verify(admins).save(existing);
        assertThat(encoder.matches("Admin@2026", existing.getPasswordHash())).isTrue();
        assertThat(existing.getResetCodeHash()).isNull();
    }

    @Test
    void resetCreatesTheAdminWhenThatUsernameIsNew() {
        ReflectionTestUtils.setField(seeder, "adminReset", true);
        ReflectionTestUtils.setField(seeder, "adminPassword", "Admin@2026");
        when(admins.findByUsername("admin")).thenReturn(java.util.Optional.empty());

        seeder.seedAdmin();

        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(admins).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
        assertThat(saved.getValue().superAdmin()).isFalse();
        assertThat(encoder.matches("Admin@2026", saved.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void resetNeverTouchesTheSuperAdminOrUsesABlankPassword() {
        ReflectionTestUtils.setField(seeder, "adminReset", true);
        ReflectionTestUtils.setField(seeder, "adminPassword", "");
        seeder.seedAdmin();
        ReflectionTestUtils.setField(seeder, "adminPassword", "Admin@2026");
        AdminUser sup = new AdminUser(); sup.setUsername("admin"); sup.setRole(AdminUser.SUPER_ADMIN);
        when(admins.findByUsername("admin")).thenReturn(java.util.Optional.of(sup));
        seeder.seedAdmin();
        verify(admins, never()).save(any());
    }

    // ---------- super admin ----------

    @Test
    void superAdminIsCreatedOnceFromItsOwnSetting() {
        ReflectionTestUtils.setField(seeder, "superUser", "owner");
        ReflectionTestUtils.setField(seeder, "superPassword", "Super@Pass1");
        when(admins.existsByRole(AdminUser.SUPER_ADMIN)).thenReturn(false);
        when(admins.findByUsername("owner")).thenReturn(java.util.Optional.empty());

        seeder.seedSuperAdmin();

        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(admins).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("owner");
        assertThat(saved.getValue().superAdmin()).isTrue();
        assertThat(encoder.matches("Super@Pass1", saved.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void superAdminIsNeverGeneratedReplacedOrMadeFromAnExistingAdmin() {
        // no password: nothing
        ReflectionTestUtils.setField(seeder, "superPassword", "");
        when(admins.existsByRole(AdminUser.SUPER_ADMIN)).thenReturn(false);
        seeder.seedSuperAdmin();
        // already exists: untouched even with a new password
        ReflectionTestUtils.setField(seeder, "superPassword", "Other@Pass2");
        when(admins.existsByRole(AdminUser.SUPER_ADMIN)).thenReturn(true);
        seeder.seedSuperAdmin();
        // username belongs to an admin: refused
        ReflectionTestUtils.setField(seeder, "superUser", "admin");
        when(admins.existsByRole(AdminUser.SUPER_ADMIN)).thenReturn(false);
        when(admins.findByUsername("admin")).thenReturn(java.util.Optional.of(new AdminUser()));
        seeder.seedSuperAdmin();
        verify(admins, never()).save(any());
    }
}
