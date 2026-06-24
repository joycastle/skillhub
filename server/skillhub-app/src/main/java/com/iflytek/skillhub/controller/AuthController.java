package com.iflytek.skillhub.controller;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.auth.rbac.PlatformRoleDefaults;
import com.iflytek.skillhub.auth.repository.UserRoleBindingRepository;
import com.iflytek.skillhub.auth.session.PlatformSessionService;
import com.iflytek.skillhub.domain.user.UserAccount;
import com.iflytek.skillhub.domain.user.UserAccountRepository;
import com.iflytek.skillhub.domain.user.UserStatus;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.dto.AuthMeResponse;
import com.iflytek.skillhub.dto.AuthMethodResponse;
import com.iflytek.skillhub.dto.AuthProviderResponse;
import com.iflytek.skillhub.service.AuthMethodCatalog;
import com.iflytek.skillhub.exception.UnauthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Authentication-facing HTTP endpoints for Feishu browser login.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController extends BaseApiController {

    private final AuthMethodCatalog authMethodCatalog;
    private final UserRoleBindingRepository userRoleBindingRepository;
    private final PlatformSessionService platformSessionService;
    private final UserAccountRepository userAccountRepository;

    public AuthController(ApiResponseFactory responseFactory,
                          AuthMethodCatalog authMethodCatalog,
                          UserRoleBindingRepository userRoleBindingRepository,
                          PlatformSessionService platformSessionService,
                          UserAccountRepository userAccountRepository) {
        super(responseFactory);
        this.authMethodCatalog = authMethodCatalog;
        this.userRoleBindingRepository = userRoleBindingRepository;
        this.platformSessionService = platformSessionService;
        this.userAccountRepository = userAccountRepository;
    }

    @GetMapping("/me")
    public ApiResponse<AuthMeResponse> me(@AuthenticationPrincipal PlatformPrincipal principal,
                                          Authentication authentication,
                                          HttpServletRequest request) {
        if (principal == null || authentication == null || !authentication.isAuthenticated()) {
            throw new UnauthorizedException("error.auth.required");
        }
        UserAccount user = userAccountRepository.findById(principal.userId()).orElse(null);
        if (user == null || user.getStatus() == UserStatus.DISABLED) {
            request.getSession().invalidate();
            throw new UnauthorizedException("error.auth.required");
        }
        Set<String> freshRoles = PlatformRoleDefaults.withDefaultUserRole(
                userRoleBindingRepository.findByUserId(principal.userId()).stream()
                        .map(binding -> binding.getRole().getCode())
                        .collect(Collectors.toSet()));

        boolean rolesChanged = !freshRoles.equals(principal.platformRoles());
        boolean displayNameChanged = !user.getDisplayName().equals(principal.displayName());
        boolean avatarChanged = !java.util.Objects.equals(user.getAvatarUrl(), principal.avatarUrl());

        if (rolesChanged || displayNameChanged || avatarChanged) {
            principal = new PlatformPrincipal(
                    principal.userId(),
                    user.getDisplayName(),
                    principal.email(),
                    user.getAvatarUrl(),
                    principal.oauthProvider(),
                    freshRoles);
            platformSessionService.establishSession(principal, request, false);
        }
        return ok("response.success.read", AuthMeResponse.from(principal));
    }

    @GetMapping("/providers")
    public ApiResponse<List<AuthProviderResponse>> providers(
            @RequestParam(name = "returnTo", required = false) String returnTo) {
        return ok("response.success.read", authMethodCatalog.listOAuthProviders(returnTo));
    }

    @GetMapping("/methods")
    public ApiResponse<List<AuthMethodResponse>> methods(
            @RequestParam(name = "returnTo", required = false) String returnTo) {
        return ok("response.success.read", authMethodCatalog.listMethods(returnTo));
    }
}
