package com.iflytek.skillhub.auth.oauth;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.auth.session.PlatformSessionService;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Login success handler that copies the resolved platform principal into the
 * HTTP session and then redirects to the stored return target or default URL.
 * 
 * <p>This handler extends {@link SimpleUrlAuthenticationSuccessHandler} and only
 * uses the returnTo parameter stored in session and the default target URL for
 * redirect decisions, ignoring any saved request from Spring Security's RequestCache.
 */
@Component
public class OAuth2LoginSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final PlatformSessionService platformSessionService;
    private final OAuthLoginFlowService oauthLoginFlowService;
    private final String webBaseUrl;

    public OAuth2LoginSuccessHandler(PlatformSessionService platformSessionService,
                                     OAuthLoginFlowService oauthLoginFlowService,
                                     @Value("${skillhub.auth.web-base-url:}") String webBaseUrl) {
        this.platformSessionService = platformSessionService;
        this.oauthLoginFlowService = oauthLoginFlowService;
        this.webBaseUrl = webBaseUrl;
        setDefaultTargetUrl(OAuthLoginRedirectSupport.toWebRedirect(
                OAuthLoginRedirectSupport.DEFAULT_TARGET_URL,
                webBaseUrl
        ));
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                         Authentication authentication) throws IOException, ServletException {
        if (authentication.getPrincipal() instanceof OAuth2User oAuth2User) {
            PlatformPrincipal principal = (PlatformPrincipal) oAuth2User.getAttributes().get("platformPrincipal");
            if (principal != null) {
                platformSessionService.attachToAuthenticatedSession(principal, authentication, request);
            }
        }
        String returnTo = oauthLoginFlowService.consumeReturnTo(request.getSession(false));
        if (returnTo != null) {
            getRedirectStrategy().sendRedirect(
                    request,
                    response,
                    OAuthLoginRedirectSupport.toWebRedirect(returnTo, webBaseUrl)
            );
            // The default branch below clears these via super; clear here too so both paths behave consistently.
            clearAuthenticationAttributes(request);
            return;
        }
        super.onAuthenticationSuccess(request, response, authentication);
    }
}
