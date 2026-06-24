package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.config.SkillRepositoryProperties;
import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.controller.support.SkillPackageArchiveExtractor;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.LocalizedDomainException;
import com.iflytek.skillhub.domain.skill.SkillVisibility;
import com.iflytek.skillhub.domain.skill.service.SkillPublishService;
import com.iflytek.skillhub.domain.skill.validation.PackageEntry;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.dto.BatchPublishItemResult;
import com.iflytek.skillhub.dto.BatchPublishResponse;
import com.iflytek.skillhub.dto.PublishResponse;
import com.iflytek.skillhub.metrics.SkillHubMetrics;
import com.iflytek.skillhub.ratelimit.RateLimit;
import com.iflytek.skillhub.service.SkillVisibilityScopeResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Upload endpoints for skill packages.
 *
 * <p>The controller is responsible for archive extraction and request shaping,
 * while the domain service owns all publication validation and state changes.
 */
@RestController
@RequestMapping({"/api/v1/skills", "/api/web/skills"})
public class SkillPublishController extends BaseApiController {

    private static final Logger log = LoggerFactory.getLogger(SkillPublishController.class);
    private static final int MAX_BATCH_FILES = 20;
    private static final String PRECHECK_CONFIRM_CODE = "error.skill.publish.precheck.confirmRequired";

    private final SkillPublishService skillPublishService;
    private final SkillPackageArchiveExtractor skillPackageArchiveExtractor;
    private final SkillHubMetrics skillHubMetrics;
    private final SkillVisibilityScopeResolver visibilityScopeResolver;
    private final SkillRepositoryProperties repositoryProperties;
    private final MessageSource messageSource;

    public SkillPublishController(SkillPublishService skillPublishService,
                                  SkillPackageArchiveExtractor skillPackageArchiveExtractor,
                                  ApiResponseFactory responseFactory,
                                  SkillHubMetrics skillHubMetrics,
                                  SkillVisibilityScopeResolver visibilityScopeResolver,
                                  SkillRepositoryProperties repositoryProperties,
                                  MessageSource messageSource) {
        super(responseFactory);
        this.skillPublishService = skillPublishService;
        this.skillPackageArchiveExtractor = skillPackageArchiveExtractor;
        this.skillHubMetrics = skillHubMetrics;
        this.visibilityScopeResolver = visibilityScopeResolver;
        this.repositoryProperties = repositoryProperties;
        this.messageSource = messageSource;
    }

    /**
     * Publishes an uploaded package into the target namespace after archive
     * extraction and visibility parsing.
     */
    @PostMapping("/{namespace}/publish")
    @RateLimit(category = "publish", authenticated = 10, anonymous = 0)
    public ApiResponse<PublishResponse> publish(
            @PathVariable String namespace,
            @RequestParam("file") MultipartFile file,
            @RequestParam("visibility") String visibility,
            @RequestParam(value = "confirmWarnings", defaultValue = "false") boolean confirmWarnings,
            @AuthenticationPrincipal PlatformPrincipal principal) throws IOException {

        SkillVisibility skillVisibility = visibilityScopeResolver.resolve(visibility);
        validatePublishNamespace(namespace);

        PublishResponse response = publishSingleFile(
                namespace,
                file,
                skillVisibility,
                confirmWarnings,
                principal.userId(),
                principal.platformRoles()
        );

        return ok("response.success.published", response);
    }

    /**
     * Publishes multiple uploaded packages in one request. Each file is processed
     * independently so partial success is allowed.
     */
    @PostMapping("/{namespace}/publish-batch")
    @RateLimit(category = "publish-batch", authenticated = 5, anonymous = 0)
    public ApiResponse<BatchPublishResponse> publishBatch(
            @PathVariable String namespace,
            @RequestParam("files") MultipartFile[] files,
            @RequestParam("visibility") String visibility,
            @RequestParam(value = "confirmWarnings", defaultValue = "false") boolean confirmWarnings,
            @AuthenticationPrincipal PlatformPrincipal principal) {

        SkillVisibility skillVisibility = visibilityScopeResolver.resolve(visibility);
        validatePublishNamespace(namespace);

        List<MultipartFile> uploadFiles = files == null
                ? List.of()
                : Arrays.stream(files).filter(file -> file != null && !file.isEmpty()).toList();
        if (uploadFiles.isEmpty()) {
            throw new DomainBadRequestException("error.skill.publish.batch.empty");
        }
        if (uploadFiles.size() > MAX_BATCH_FILES) {
            throw new DomainBadRequestException("error.skill.publish.batch.tooMany", MAX_BATCH_FILES);
        }

        List<BatchPublishItemResult> items = new ArrayList<>(uploadFiles.size());
        int succeeded = 0;
        int failed = 0;
        int needsConfirmation = 0;

        for (MultipartFile file : uploadFiles) {
            BatchPublishItemResult item = publishBatchItem(
                    namespace,
                    file,
                    skillVisibility,
                    confirmWarnings,
                    principal.userId(),
                    principal.platformRoles()
            );
            items.add(item);
            if (item.success()) {
                succeeded++;
            } else if (item.needsConfirmation()) {
                needsConfirmation++;
                failed++;
            } else {
                failed++;
            }
        }

        BatchPublishResponse response = new BatchPublishResponse(
                uploadFiles.size(),
                succeeded,
                failed,
                needsConfirmation,
                items
        );

        return ok("response.success.publishedBatch", response, succeeded, failed);
    }

    private void validatePublishNamespace(String namespace) {
        if (!repositoryProperties.isOpenPublishSlug(namespace)) {
            throw new DomainBadRequestException("error.skill.publish.repository.invalid", namespace);
        }
    }

    private PublishResponse publishSingleFile(
            String namespace,
            MultipartFile file,
            SkillVisibility skillVisibility,
            boolean confirmWarnings,
            String publisherId,
            Set<String> platformRoles) throws IOException {

        ExtractedPackage extractedPackage = extractPackage(file);

        if (!confirmWarnings && !extractedPackage.extractionWarnings().isEmpty()) {
            throw new DomainBadRequestException(
                    PRECHECK_CONFIRM_CODE,
                    String.join("\n", extractedPackage.extractionWarnings()));
        }

        SkillPublishService.PublishResult publishResult = skillPublishService.publishFromEntries(
                namespace,
                extractedPackage.entries(),
                publisherId,
                skillVisibility,
                platformRoles,
                confirmWarnings
        );

        PublishResponse response = toPublishResponse(namespace, publishResult);
        skillHubMetrics.incrementSkillPublish(namespace, publishResult.version().getStatus().name());
        return response;
    }

    private BatchPublishItemResult publishBatchItem(
            String namespace,
            MultipartFile file,
            SkillVisibility skillVisibility,
            boolean confirmWarnings,
            String publisherId,
            Set<String> platformRoles) {

        String filename = file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
                ? "unknown.zip"
                : file.getOriginalFilename();

        try {
            ExtractedPackage extractedPackage = extractPackage(file);

            if (!confirmWarnings && !extractedPackage.extractionWarnings().isEmpty()) {
                List<String> warnings = extractedPackage.extractionWarnings();
                return new BatchPublishItemResult(
                        filename,
                        false,
                        true,
                        null,
                        PRECHECK_CONFIRM_CODE,
                        localize(PRECHECK_CONFIRM_CODE, String.join("\n", warnings)),
                        warnings
                );
            }

            SkillPublishService.PublishResult publishResult = skillPublishService.publishFromEntries(
                    namespace,
                    extractedPackage.entries(),
                    publisherId,
                    skillVisibility,
                    platformRoles,
                    confirmWarnings
            );
            skillHubMetrics.incrementSkillPublish(namespace, publishResult.version().getStatus().name());

            return new BatchPublishItemResult(
                    filename,
                    true,
                    false,
                    toPublishResponse(namespace, publishResult),
                    null,
                    null,
                    List.of()
            );
        } catch (LocalizedDomainException ex) {
            log.warn("Batch publish failed [filename={}, code={}]", filename, ex.messageCode());
            boolean needsConfirmation = PRECHECK_CONFIRM_CODE.equals(ex.messageCode());
            List<String> warnings = needsConfirmation ? extractWarningLines(ex) : List.of();
            return new BatchPublishItemResult(
                    filename,
                    false,
                    needsConfirmation,
                    null,
                    ex.messageCode(),
                    localize(ex.messageCode(), ex.messageArgs()),
                    warnings
            );
        } catch (IllegalArgumentException | IOException ex) {
            log.warn("Batch publish extraction failed [filename={}, reason={}]", filename, ex.getMessage());
            return new BatchPublishItemResult(
                    filename,
                    false,
                    false,
                    null,
                    "error.skill.publish.package.invalid",
                    localize("error.skill.publish.package.invalid", ex.getMessage()),
                    List.of()
            );
        } catch (RuntimeException ex) {
            log.error("Batch publish unexpected failure [filename={}]", filename, ex);
            return new BatchPublishItemResult(
                    filename,
                    false,
                    false,
                    null,
                    "error.skill.publish.batch.itemFailed",
                    localize("error.skill.publish.batch.itemFailed", filename),
                    List.of()
            );
        }
    }

    private ExtractedPackage extractPackage(MultipartFile file) throws IOException {
        try {
            SkillPackageArchiveExtractor.ExtractionResult extractionResult =
                    skillPackageArchiveExtractor.extractWithWarnings(file);
            return new ExtractedPackage(extractionResult.entries(), extractionResult.warnings());
        } catch (IllegalArgumentException e) {
            log.warn("Skill package extraction failed [filename={}, size={}, reason={}]",
                    file.getOriginalFilename(), file.getSize(), e.getMessage());
            throw new DomainBadRequestException("error.skill.publish.package.invalid", e.getMessage());
        }
    }

    private PublishResponse toPublishResponse(String namespace, SkillPublishService.PublishResult publishResult) {
        return new PublishResponse(
                publishResult.skillId(),
                namespace,
                publishResult.slug(),
                publishResult.version().getVersion(),
                publishResult.version().getStatus().name(),
                publishResult.version().getFileCount(),
                publishResult.version().getTotalSize()
        );
    }

    private List<String> extractWarningLines(LocalizedDomainException ex) {
        Object[] args = ex.messageArgs();
        if (args.length == 0 || args[0] == null) {
            return List.of();
        }
        return Arrays.stream(args[0].toString().split("\n"))
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .toList();
    }

    private String localize(String messageCode, Object... args) {
        Locale locale = LocaleContextHolder.getLocale();
        return messageSource.getMessage(messageCode, args, messageCode, locale);
    }

    private record ExtractedPackage(List<PackageEntry> entries, List<String> extractionWarnings) {}
}
