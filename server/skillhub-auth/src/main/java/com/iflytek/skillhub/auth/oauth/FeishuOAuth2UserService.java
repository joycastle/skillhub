package com.iflytek.skillhub.auth.oauth;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Loads Feishu user profiles from the non-standard {@code /authen/v1/user_info} response shape.
 */
@Service
public class FeishuOAuth2UserService extends DefaultOAuth2UserService {

    private final RestClient restClient = RestClient.create();

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        if (!"feishu".equals(userRequest.getClientRegistration().getRegistrationId())) {
            return super.loadUser(userRequest);
        }

        String userInfoUri = userRequest.getClientRegistration().getProviderDetails().getUserInfoEndpoint().getUri();
        Map<String, Object> responseBody;
        try {
            responseBody = restClient.get()
                    .uri(userInfoUri)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + userRequest.getAccessToken().getTokenValue())
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {
                    });
        } catch (RestClientException ex) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("invalid_user_info_response", "Failed to call Feishu user_info endpoint", null),
                    ex
            );
        }

        if (responseBody == null) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("invalid_user_info_response", "Feishu user_info response is empty", null)
            );
        }

        int apiCode = responseBody.get("code") instanceof Number number ? number.intValue() : 0;
        if (apiCode != 0) {
            String message = String.valueOf(responseBody.getOrDefault("msg", "Feishu user_info failed"));
            throw new OAuth2AuthenticationException(new OAuth2Error("invalid_user_info_response", message, null));
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> userData = responseBody.get("data") instanceof Map<?, ?> nested
                ? (Map<String, Object>) nested
                : responseBody;

        String openId = firstNonBlank(userData, "open_id");
        if (!StringUtils.hasText(openId)) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("invalid_user_info", "Feishu user_info is missing open_id", null)
            );
        }

        Map<String, Object> attributes = new LinkedHashMap<>(userData);
        attributes.put("data", userData);

        Set<GrantedAuthority> authorities = new LinkedHashSet<>();
        userRequest.getAccessToken().getScopes().forEach(scope ->
                authorities.add(new SimpleGrantedAuthority("SCOPE_" + scope))
        );

        return new DefaultOAuth2User(authorities, attributes, "open_id");
    }

    private static String firstNonBlank(Map<String, Object> attrs, String... keys) {
        for (String key : keys) {
            Object value = attrs.get(key);
            if (value instanceof String str && !str.isBlank()) {
                return str;
            }
            if (value != null && !value.toString().isBlank()) {
                return value.toString();
            }
        }
        return null;
    }
}
