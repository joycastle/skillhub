package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.config.SkillRepositoryProperties;
import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.dto.SkillRepositoryResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping({"/api/v1/repositories", "/api/web/repositories"})
public class SkillRepositoryController extends BaseApiController {

    private final SkillRepositoryProperties repositoryProperties;

    public SkillRepositoryController(SkillRepositoryProperties repositoryProperties,
                                     ApiResponseFactory responseFactory) {
        super(responseFactory);
        this.repositoryProperties = repositoryProperties;
    }

    @GetMapping
    public ApiResponse<List<SkillRepositoryResponse>> listRepositories() {
        List<SkillRepositoryResponse> repositories = repositoryProperties.getCatalog().stream()
                .map(item -> new SkillRepositoryResponse(
                        item.slug(),
                        item.displayName(),
                        item.defaultRepository()
                ))
                .toList();
        return ok("response.success.read", repositories);
    }
}
