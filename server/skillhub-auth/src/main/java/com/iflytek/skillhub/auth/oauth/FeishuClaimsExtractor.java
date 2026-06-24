package com.iflytek.skillhub.auth.oauth;

import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Extracts Feishu/Lark OAuth user identity into the platform's normalized identity model.
 *
 * <p>Feishu's user-info API commonly returns user fields under a nested {@code data}
 * object. This extractor also accepts flat attributes so it works behind gateways
 * or broker adapters that normalize the payload.
 */
@Component
public class FeishuClaimsExtractor implements OAuthClaimsExtractor {

    @Override
    public String getProvider() {
        return "feishu";
    }

    @Override
    public OAuthClaims extract(OAuth2UserRequest request, OAuth2User oAuth2User) {
        Map<String, Object> attrs = oAuth2User.getAttributes();
        Map<String, Object> user = nestedData(attrs);

        String subject = firstNonBlank(user, "open_id");
        if (subject == null) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("invalid_user_info", "Feishu user info is missing open_id", null)
            );
        }

        String displayName = firstNonBlank(user, "name", "en_name", "nickname", "email");
        if (displayName == null) {
            displayName = subject;
        }

        String email = firstNonBlank(user, "email");
        String avatar = firstNonBlank(user, "avatar_url", "avatar_thumb", "avatar_middle", "avatar_big");

        Map<String, Object> extra = new LinkedHashMap<>(attrs);
        extra.put("feishu_user", user);
        if (avatar != null) {
            extra.put("avatar_url", avatar);
        }

        return new OAuthClaims(
                "feishu",
                subject,
                email,
                email != null,
                displayName,
                extra
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> nestedData(Map<String, Object> attrs) {
        Object data = attrs.get("data");
        if (data instanceof Map<?, ?> dataMap) {
            return (Map<String, Object>) dataMap;
        }
        return attrs;
    }

    private String firstNonBlank(Map<String, Object> attrs, String... keys) {
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
