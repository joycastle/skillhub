package com.iflytek.skillhub.auth.oauth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationExchange;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationResponse;

class FeishuOAuth2AccessTokenResponseClientTest {

    @Test
    void getTokenResponse_rejectsNonFeishuRegistration() {
        FeishuOAuth2AccessTokenResponseClient client = new FeishuOAuth2AccessTokenResponseClient();
        ClientRegistration registration = ClientRegistration.withRegistrationId("github")
                .clientId("id")
                .clientSecret("secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .authorizationUri("https://example.com/authorize")
                .tokenUri("https://example.com/token")
                .userInfoUri("https://example.com/user")
                .userNameAttributeName("id")
                .build();

        OAuth2AuthorizationCodeGrantRequest request = new OAuth2AuthorizationCodeGrantRequest(
                registration,
                authorizationExchange(registration, "code")
        );

        assertThatThrownBy(() -> client.getTokenResponse(request))
                .isInstanceOf(OAuth2AuthorizationException.class);
    }

    private static OAuth2AuthorizationExchange authorizationExchange(ClientRegistration registration, String code) {
        OAuth2AuthorizationRequest authorizationRequest = OAuth2AuthorizationRequest.authorizationCode()
                .clientId(registration.getClientId())
                .authorizationUri(registration.getProviderDetails().getAuthorizationUri())
                .redirectUri(registration.getRedirectUri())
                .build();
        OAuth2AuthorizationResponse authorizationResponse = OAuth2AuthorizationResponse.success(code)
                .redirectUri(registration.getRedirectUri())
                .state("state")
                .build();
        return new OAuth2AuthorizationExchange(authorizationRequest, authorizationResponse);
    }
}
