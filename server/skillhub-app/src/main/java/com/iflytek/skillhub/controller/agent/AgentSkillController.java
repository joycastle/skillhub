package com.iflytek.skillhub.controller.agent;

import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.skill.service.SkillQueryService;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.ratelimit.RateLimit;
import com.iflytek.skillhub.service.cli.CliSkillAppService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Minimal read/download API intended for agents.
 *
 * <p>The Hub still stores and serves versioned zip bundles. Agents can search first,
 * inspect a lightweight detail payload, and download only the selected skill package.
 */
@RestController
@RequestMapping("/api/agent/v1/skills")
public class AgentSkillController extends BaseApiController {

    private final CliSkillAppService cliSkillAppService;
    private final SkillQueryService skillQueryService;

    public AgentSkillController(
            CliSkillAppService cliSkillAppService,
            SkillQueryService skillQueryService,
            ApiResponseFactory responseFactory) {
        super(responseFactory);
        this.cliSkillAppService = cliSkillAppService;
        this.skillQueryService = skillQueryService;
    }

    @GetMapping("/search")
    @RateLimit(category = "search", authenticated = 60, anonymous = 20)
    public ApiResponse<AgentSkillSearchResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "20") int limit,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> userNsRoles) {
        var result = cliSkillAppService.search(q, limit, userId, userNsRoles);
        List<AgentSkillSearchItemResponse> items = result.items().stream()
                .map(item -> new AgentSkillSearchItemResponse(
                        item.namespace(),
                        item.slug(),
                        item.latestVersion(),
                        item.summary(),
                        agentDownloadUrl(item.namespace(), item.slug(), item.latestVersion())
                ))
                .toList();
        return ok("response.success.read", new AgentSkillSearchResponse(items, result.total(), result.limit()));
    }

    @GetMapping("/{namespace}/{slug}")
    public ApiResponse<AgentSkillDetailResponse> detail(
            @PathVariable String namespace,
            @PathVariable String slug,
            @RequestParam(required = false) String version,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> userNsRoles) {
        Map<Long, NamespaceRole> roles = userNsRoles != null ? userNsRoles : Map.of();
        var detail = skillQueryService.getSkillDetail(namespace, slug, userId, roles);
        var resolved = cliSkillAppService.resolve(namespace, slug, version, userId, roles);
        return ok("response.success.read", new AgentSkillDetailResponse(
                resolved.namespace(),
                resolved.slug(),
                detail.displayName(),
                detail.summary(),
                resolved.version(),
                resolved.fingerprint(),
                agentDownloadUrl(resolved.namespace(), resolved.slug(), resolved.version())
        ));
    }

    @GetMapping("/{namespace}/{slug}/download")
    @RateLimit(category = "download", authenticated = 120, anonymous = 30)
    public ResponseEntity<InputStreamResource> downloadLatest(
            @PathVariable String namespace,
            @PathVariable String slug,
            HttpServletRequest request) {
        return cliSkillAppService.downloadLatest(namespace, slug, request);
    }

    @GetMapping("/{namespace}/{slug}/versions/{version}/download")
    @RateLimit(category = "download", authenticated = 120, anonymous = 30)
    public ResponseEntity<InputStreamResource> downloadVersion(
            @PathVariable String namespace,
            @PathVariable String slug,
            @PathVariable String version,
            HttpServletRequest request) {
        return cliSkillAppService.downloadVersion(namespace, slug, version, request);
    }

    private String agentDownloadUrl(String namespace, String slug, String version) {
        if (version == null || version.isBlank()) {
            return String.format("/api/agent/v1/skills/%s/%s/download", namespace, slug);
        }
        return String.format("/api/agent/v1/skills/%s/%s/versions/%s/download", namespace, slug, version);
    }

    public record AgentSkillSearchResponse(
            List<AgentSkillSearchItemResponse> items,
            long total,
            int limit
    ) {}

    public record AgentSkillSearchItemResponse(
            String namespace,
            String slug,
            String latestVersion,
            String summary,
            String downloadUrl
    ) {}

    public record AgentSkillDetailResponse(
            String namespace,
            String slug,
            String title,
            String summary,
            String version,
            String fingerprint,
            String downloadUrl
    ) {}
}
