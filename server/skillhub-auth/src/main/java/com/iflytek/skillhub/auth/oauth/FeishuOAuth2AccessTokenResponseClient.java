package com.iflytek.skillhub.auth.oauth;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Feishu uses a JSON token endpoint and wraps API responses in {@code code}/{@code msg}.
 * Spring's default form-encoded OAuth2 token client cannot exchange Feishu auth codes.
 */
@Component
public class FeishuOAuth2AccessTokenResponseClient
        implements OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> {

    private final RestClient restClient = RestClient.create();

    @Override
    public OAuth2AccessTokenResponse getTokenResponse(OAuth2AuthorizationCodeGrantRequest authorizationGrantRequest) {
        ClientRegistration registration = authorizationGrantRequest.getClientRegistration();
        if (!"feishu".equals(registration.getRegistrationId())) {
            throw new OAuth2AuthorizationException(
                    new OAuth2Error("unsupported_provider", "Feishu token client only supports feishu", null)
            );
        }

        var authorizationResponse = authorizationGrantRequest.getAuthorizationExchange().getAuthorizationResponse();
        String code = authorizationResponse.getCode();
        if (!StringUtils.hasText(code)) {
            throw new OAuth2AuthorizationException(
                    new OAuth2Error("invalid_grant", "Feishu authorization code is missing", null)
            );
        }

        Map<String, String> requestBody = new LinkedHashMap<>();
        requestBody.put("grant_type", "authorization_code");
        requestBody.put("client_id", registration.getClientId());
        requestBody.put("client_secret", registration.getClientSecret());
        requestBody.put("code", code);
        requestBody.put("redirect_uri", authorizationResponse.getRedirectUri());

        Map<String, Object> responseBody;
        try {
            responseBody = restClient.post()
                    .uri(registration.getProviderDetails().getTokenUri())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {
                    });
        } catch (RestClientException ex) {
            throw new OAuth2AuthorizationException(
                    new OAuth2Error("invalid_token_response", "Failed to call Feishu token endpoint", null),
                    ex
            );
        }

        if (responseBody == null) {
            throw new OAuth2AuthorizationException(
                    new OAuth2Error("invalid_token_response", "Feishu token response is empty", null)
            );
        }

        int apiCode = toInt(responseBody.get("code"), 0);
        if (apiCode != 0) {
            String message = String.valueOf(responseBody.getOrDefault("msg", "Feishu token exchange failed"));
            throw new OAuth2AuthorizationException(
                    new OAuth2Error("invalid_token_response", message, null)
            );
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> tokenData = responseBody.get("data") instanceof Map<?, ?> nested
                ? (Map<String, Object>) nested
                : responseBody;

        String accessToken = asString(tokenData.get("access_token"));
        if (!StringUtils.hasText(accessToken)) {
            throw new OAuth2AuthorizationException(
                    new OAuth2Error("invalid_token_response", "Feishu token response is missing access_token", null)
            );
        }

        OAuth2AccessTokenResponse.Builder builder = OAuth2AccessTokenResponse.withToken(accessToken)
                .tokenType(OAuth2AccessToken.TokenType.BEARER);

        Long expiresIn = toLong(tokenData.get("expires_in"));
        if (expiresIn != null) {
            builder.expiresIn(expiresIn);
        }

        String refreshToken = asString(tokenData.get("refresh_token"));
        if (StringUtils.hasText(refreshToken)) {
            builder.refreshToken(refreshToken);
        }

        String scope = asString(tokenData.get("scope"));
        if (StringUtils.hasText(scope)) {
            builder.scopes(Set.of(StringUtils.delimitedListToStringArray(scope, " ")));
        }

        return builder.build();
    }

    private static int toInt(Object value, int defaultValue) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(value.toString());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private static Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value != null) {
            try {
                return Long.parseLong(value.toString());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }
}
