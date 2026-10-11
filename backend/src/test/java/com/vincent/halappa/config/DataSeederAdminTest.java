package com.vincent.halappa.config;

import com.vincent.halappa.domain.*;
import com.vincent.halappa.service.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

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
        when(admins.count()).thenReturn(0L);

        seeder.seedAdmin();

        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(admins).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
        assertThat(encoder.matches("Chosen@Pass1", saved.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void withoutAConfiguredPasswordNothingIsGeneratedOrCreated() {
        when(admins.count()).thenReturn(0L);
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
        when(admins.count()).thenReturn(1L);

        seeder.seedAdmin();
        seeder.seedAdmin();

        verify(admins, never()).save(any());
        verify(admins, never()).delete(any());
        verify(admins, never()).deleteAll();
    }
}
