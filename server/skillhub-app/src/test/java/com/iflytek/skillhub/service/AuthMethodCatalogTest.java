package com.iflytek.skillhub.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.security.oauth2.client.OAuth2ClientProperties;

class AuthMethodCatalogTest {

    @Test
    void listMethodsShouldExposeOnlyFeishuOAuth() {
        OAuth2ClientProperties oauthProperties = new OAuth2ClientProperties();
        OAuth2ClientProperties.Registration feishu = new OAuth2ClientProperties.Registration();
        feishu.setClientName("飞书");
        oauthProperties.getRegistration().put("feishu", feishu);
        oauthProperties.getRegistration().put("github", new OAuth2ClientProperties.Registration());

        AuthMethodCatalog catalog = new AuthMethodCatalog(oauthProperties);

        assertThat(catalog.listMethods("/dashboard"))
            .hasSize(1)
            .first()
            .satisfies(method -> {
                assertThat(method.id()).isEqualTo("oauth-feishu");
                assertThat(method.methodType()).isEqualTo("OAUTH_REDIRECT");
                assertThat(method.provider()).isEqualTo("feishu");
                assertThat(method.displayName()).isEqualTo("飞书");
                assertThat(method.actionUrl()).isEqualTo("/oauth2/authorization/feishu?returnTo=%2Fdashboard");
            });
    }

    @Test
    void listOAuthProvidersShouldExposeOnlyFeishu() {
        OAuth2ClientProperties oauthProperties = new OAuth2ClientProperties();
        OAuth2ClientProperties.Registration feishu = new OAuth2ClientProperties.Registration();
        feishu.setClientName("飞书");
        oauthProperties.getRegistration().put("feishu", feishu);

        AuthMethodCatalog catalog = new AuthMethodCatalog(oauthProperties);

        assertThat(catalog.listOAuthProviders(null))
            .hasSize(1)
            .first()
            .satisfies(provider -> {
                assertThat(provider.id()).isEqualTo("feishu");
                assertThat(provider.name()).isEqualTo("飞书");
                assertThat(provider.authorizationUrl()).isEqualTo("/oauth2/authorization/feishu");
            });
    }
}
