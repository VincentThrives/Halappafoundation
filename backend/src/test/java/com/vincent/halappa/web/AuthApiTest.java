package com.vincent.halappa.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DisplayName("Admin sign in")
class AuthApiTest extends ApiTestBase {

    private String login(String user, String pw) throws Exception {
        return "{\"username\":\"" + user + "\",\"password\":\"" + pw + "\"}";
    }

    @Test
    void correctCredentialsReturnToken() throws Exception {
        mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(login("admin", ADMIN_PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.username").value("admin"));
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(login("admin", "wrong")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Wrong username or password"));
    }

    @Test
    void unknownUserIs401WithSameMessage() throws Exception {
        mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(login("nobody", "x")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Wrong username or password"));
    }

    @Test
    void blankFieldsAre400() throws Exception {
        mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(login("", "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void bruteForceIsBlockedAfterTenAttempts() throws Exception {
        var ip = newIp();
        for (int i = 0; i < 10; i++) {
            mvc.perform(post("/api/auth/login").with(ip).contentType(MediaType.APPLICATION_JSON).content(login("admin", "bad" + i)))
                    .andExpect(status().isUnauthorized());
        }
        // Even the right password is refused once the limit is hit.
        mvc.perform(post("/api/auth/login").with(ip).contentType(MediaType.APPLICATION_JSON).content(login("admin", ADMIN_PASSWORD)))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void meReturnsSignedInUser() throws Exception {
        mvc.perform(get("/api/auth/me").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"));
    }

    @Test
    void forgotPasswordExplainsWhenEmailIsNotSetUp() throws Exception {
        // This test context has no SMTP host, so no code can be sent
        mvc.perform(post("/api/auth/forgot").with(newIp()).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"admin\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("isn't set up on the server")));
        // Reset needs a code that was sent; none exists
        mvc.perform(post("/api/auth/reset").with(newIp()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"code\":\"123456\",\"password\":\"Whatever@123\"}"))
                .andExpect(status().isBadRequest());
        // Both are reachable without signing in
        mvc.perform(post("/api/auth/reset").with(newIp()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        org.assertj.core.api.Assertions.assertThat(AuthController.mask("info@halappafoundation.in")).isEqualTo("in**@halappafoundation.in");
        org.assertj.core.api.Assertions.assertThat(AuthController.mask("a@x.org")).isEqualTo("a**@x.org");
    }

    @Test
    void changePasswordFlow() throws Exception {
        // Wrong current password
        mvc.perform(post("/api/auth/change-password").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current\":\"nope\",\"next\":\"NewPass@123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Current password is wrong"));
        // Too short
        mvc.perform(post("/api/auth/change-password").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current\":\"" + ADMIN_PASSWORD + "\",\"next\":\"short\"}"))
                .andExpect(status().isBadRequest());
        // Success, then the new password works and the old one doesn't
        mvc.perform(post("/api/auth/change-password").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current\":\"" + ADMIN_PASSWORD + "\",\"next\":\"NewPass@123\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(login("admin", "NewPass@123")))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").with(newIp()).contentType(MediaType.APPLICATION_JSON).content(login("admin", ADMIN_PASSWORD)))
                .andExpect(status().isUnauthorized());
        // Restore for other tests
        mvc.perform(post("/api/auth/change-password").with(admin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current\":\"NewPass@123\",\"next\":\"" + ADMIN_PASSWORD + "\"}"))
                .andExpect(status().isOk());
    }
}
