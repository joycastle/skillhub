package com.iflytek.skillhub.auth.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.auth.rbac.PlatformRoleDefaults;
import com.iflytek.skillhub.domain.namespace.GlobalNamespaceMembershipService;
import com.iflytek.skillhub.domain.user.UserAccount;
import com.iflytek.skillhub.domain.user.UserAccountRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;

/**
 * Authenticates Hermes Agent requests to the SkillHub Agent API.
 *
 * <p>The Agent signs a short-lived HS256 JWT after it has already resolved the
 * Feishu sender. SkillHub trusts only the signature, not a raw user id header.
 */
@Component
public class AgentJwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String AUTH_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String FEISHU_PREFIX = "feishu:";

    private final ObjectMapper objectMapper;
    private final UserAccountRepository userAccountRepository;
    private final GlobalNamespaceMembershipService globalNamespaceMembershipService;
    private final AuthenticationEntryPoint authenticationEntryPoint;
    private final String jwtSecret;
    private final String expectedIssuer;

    public AgentJwtAuthenticationFilter(
            ObjectMapper objectMapper,
            UserAccountRepository userAccountRepository,
            GlobalNamespaceMembershipService globalNamespaceMembershipService,
            AuthenticationEntryPoint authenticationEntryPoint,
            @Value("${skillhub.agent.jwt.secret:}") String jwtSecret,
            @Value("${skillhub.agent.jwt.issuer:hermes-agent}") String expectedIssuer) {
        this.objectMapper = objectMapper;
        this.userAccountRepository = userAccountRepository;
        this.globalNamespaceMembershipService = globalNamespaceMembershipService;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.jwtSecret = jwtSecret;
        this.expectedIssuer = expectedIssuer;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String rawToken = extractBearerToken(request.getHeader(AUTH_HEADER));
        if (rawToken == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Map<String, Object> claims = validateAndParse(rawToken);
            PlatformPrincipal principal = principalFromClaims(claims);
            var authorities = principal.platformRoles().stream()
                    .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                    .toList();
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(principal, null, authorities)
            );
        } catch (RuntimeException exception) {
            SecurityContextHolder.clearContext();
            authenticationEntryPoint.commence(
                    request,
                    response,
                    new BadCredentialsException("Invalid Agent JWT", exception)
            );
            return;
        }

        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/agent/v1/");
    }

    private Map<String, Object> validateAndParse(String token) {
        if (jwtSecret == null || jwtSecret.isBlank()) {
            throw new IllegalStateException("Agent JWT secret is not configured");
        }

        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("JWT must have three parts");
        }

        String signingInput = parts[0] + "." + parts[1];
        byte[] expectedSignature = hmacSha256(signingInput);
        byte[] actualSignature = base64UrlDecode(parts[2]);
        if (!java.security.MessageDigest.isEqual(expectedSignature, actualSignature)) {
            throw new IllegalArgumentException("JWT signature mismatch");
        }

        Map<String, Object> header = parseJson(parts[0]);
        if (!"HS256".equals(header.get("alg"))) {
            throw new IllegalArgumentException("Only HS256 Agent JWTs are supported");
        }

        Map<String, Object> claims = parseJson(parts[1]);
        if (expectedIssuer != null && !expectedIssuer.isBlank() && !expectedIssuer.equals(claims.get("iss"))) {
            throw new IllegalArgumentException("Unexpected JWT issuer");
        }
        Object exp = claims.get("exp");
        if (!(exp instanceof Number number) || Instant.now().getEpochSecond() >= number.longValue()) {
            throw new IllegalArgumentException("JWT is expired or missing exp");
        }
        String subject = stringClaim(claims, "sub");
        if (subject == null || !subject.startsWith(FEISHU_PREFIX)) {
            throw new IllegalArgumentException("JWT sub must be feishu:{open_id}");
        }
        return claims;
    }

    private PlatformPrincipal principalFromClaims(Map<String, Object> claims) {
        String userId = stringClaim(claims, "sub");
        String displayName = stringClaim(claims, "name");
        String email = stringClaim(claims, "email");
        String avatar = stringClaim(claims, "avatar_url");
        if (displayName == null || displayName.isBlank()) {
            displayName = userId;
        }

        String finalDisplayName = displayName;
        UserAccount user = userAccountRepository.findById(userId)
                .orElseGet(() -> new UserAccount(userId, finalDisplayName, email, avatar));
        user.setDisplayName(displayName);
        if (email != null && !email.isBlank()) {
            user.setEmail(email);
        }
        if (avatar != null && !avatar.isBlank()) {
            user.setAvatarUrl(avatar);
        }
        user = userAccountRepository.save(user);
        globalNamespaceMembershipService.ensureMember(user.getId());

        Set<String> roles = PlatformRoleDefaults.withDefaultUserRole(Set.of());
        return new PlatformPrincipal(
                user.getId(),
                user.getDisplayName(),
                user.getEmail(),
                user.getAvatarUrl(),
                "agent_jwt",
                roles
        );
    }

    private String extractBearerToken(String authHeader) {
        if (authHeader == null || !authHeader.regionMatches(true, 0, "Bearer", 0, "Bearer".length())) {
            return null;
        }
        if (authHeader.length() <= BEARER_PREFIX.length() - 1 || authHeader.charAt(BEARER_PREFIX.length() - 1) != ' ') {
            return null;
        }
        String token = authHeader.substring(BEARER_PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }

    private byte[] hmacSha256(String signingInput) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to verify Agent JWT", exception);
        }
    }

    private Map<String, Object> parseJson(String base64Url) {
        try {
            return objectMapper.readValue(base64UrlDecode(base64Url), new TypeReference<>() {});
        } catch (IOException exception) {
            throw new IllegalArgumentException("Invalid JWT JSON", exception);
        }
    }

    private byte[] base64UrlDecode(String value) {
        return Base64.getUrlDecoder().decode(value);
    }

    private String stringClaim(Map<String, Object> claims, String key) {
        Object value = claims.get(key);
        if (value instanceof String str && !str.isBlank()) {
            return str;
        }
        return null;
    }
}
