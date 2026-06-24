package com.iflytek.skillhub.controller;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.auth.repository.UserRoleBindingRepository;
import com.iflytek.skillhub.domain.namespace.NamespaceMemberRepository;
import com.iflytek.skillhub.domain.user.UserAccount;
import com.iflytek.skillhub.domain.user.UserAccountRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Set;

import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.security.oauth2.client.registration.feishu.client-id=cli_test",
    "spring.security.oauth2.client.registration.feishu.client-secret=secret",
    "spring.security.oauth2.client.registration.feishu.client-name=飞书",
    "spring.security.oauth2.client.registration.feishu.authorization-grant-type=authorization_code",
    "spring.security.oauth2.client.registration.feishu.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}",
    "spring.security.oauth2.client.registration.feishu.scope=contact:user.base:readonly",
    "spring.security.oauth2.client.provider.feishu.authorization-uri=https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    "spring.security.oauth2.client.provider.feishu.token-uri=https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    "spring.security.oauth2.client.provider.feishu.user-info-uri=https://open.feishu.cn/open-apis/authen/v1/user_info",
    "spring.security.oauth2.client.provider.feishu.user-name-attribute=open_id"
})
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private NamespaceMemberRepository namespaceMemberRepository;

    @MockBean
    private UserAccountRepository userAccountRepository;

    @MockBean
    private UserRoleBindingRepository userRoleBindingRepository;

    @Test
    void meShouldReturnUnauthorizedForAnonymousRequest() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value(401));
    }

    @Test
    void meShouldReturnCurrentPrincipal() throws Exception {
        given(namespaceMemberRepository.findByUserId("user-42")).willReturn(List.of());
        given(userAccountRepository.findById("user-42"))
            .willReturn(java.util.Optional.of(new UserAccount("user-42", "tester", "tester@example.com", "https://example.com/avatar.png")));
        given(userRoleBindingRepository.findByUserId("user-42")).willReturn(List.of());

        PlatformPrincipal principal = new PlatformPrincipal(
            "user-42",
            "tester",
            "tester@example.com",
            "https://example.com/avatar.png",
            "feishu",
            Set.of("SUPER_ADMIN")
        );

        var auth = new UsernamePasswordAuthenticationToken(
            principal,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"))
        );

        mockMvc.perform(get("/api/v1/auth/me").with(authentication(auth)))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("X-Frame-Options", "DENY"))
            .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.userId").value("user-42"))
            .andExpect(jsonPath("$.data.displayName").value("tester"))
            .andExpect(jsonPath("$.data.oauthProvider").value("feishu"))
            .andExpect(jsonPath("$.data.platformRoles[0]").value("USER"))
            .andExpect(jsonPath("$.timestamp").isNotEmpty())
            .andExpect(jsonPath("$.requestId").isNotEmpty());
    }

    @Test
    void meShouldRefreshSessionWhenDisplayNameChanges() throws Exception {
        given(namespaceMemberRepository.findByUserId("user-42")).willReturn(List.of());
        var user = new UserAccount("user-42", "UpdatedName", "tester@example.com", "https://example.com/avatar.png");
        given(userAccountRepository.findById("user-42")).willReturn(java.util.Optional.of(user));
        given(userRoleBindingRepository.findByUserId("user-42")).willReturn(List.of());

        PlatformPrincipal principal = new PlatformPrincipal(
            "user-42",
            "OldName",
            "tester@example.com",
            "https://example.com/avatar.png",
            "feishu",
            Set.of("USER")
        );

        var auth = new UsernamePasswordAuthenticationToken(
            principal,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        mockMvc.perform(get("/api/v1/auth/me").with(authentication(auth)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.displayName").value("UpdatedName"));
    }

    @Test
    void providersShouldExposeFeishuLoginEntry() throws Exception {
        mockMvc.perform(get("/api/v1/auth/providers"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].id").value("feishu"))
            .andExpect(jsonPath("$.data[0].authorizationUrl").value("/oauth2/authorization/feishu"));
    }

    @Test
    void providersShouldAppendReturnToWhenRequested() throws Exception {
        mockMvc.perform(get("/api/v1/auth/providers").param("returnTo", "/dashboard/publish"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data[0].authorizationUrl")
                .value("/oauth2/authorization/feishu?returnTo=%2Fdashboard%2Fpublish"));
    }

    @Test
    void methodsShouldExposeFeishuLoginCatalog() throws Exception {
        mockMvc.perform(get("/api/v1/auth/methods").param("returnTo", "/dashboard/publish"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].id").value("oauth-feishu"))
            .andExpect(jsonPath("$.data[0].methodType").value("OAUTH_REDIRECT"))
            .andExpect(jsonPath("$.data[0].actionUrl")
                .value("/oauth2/authorization/feishu?returnTo=%2Fdashboard%2Fpublish"));
    }
}
