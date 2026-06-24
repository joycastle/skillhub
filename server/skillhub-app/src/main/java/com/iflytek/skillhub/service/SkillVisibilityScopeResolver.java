package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.skill.SkillVisibility;
import org.springframework.stereotype.Component;

/**
 * Maps JoyHub's simplified visibility choices to persisted skill visibility.
 */
@Component
public class SkillVisibilityScopeResolver {

    public SkillVisibility resolve(String rawVisibility) {
        if (rawVisibility == null || rawVisibility.isBlank()) {
            throw new DomainBadRequestException("error.skill.publish.visibility.invalid");
        }
        String normalized = rawVisibility.trim().toUpperCase();
        return switch (normalized) {
            case "WAREHOUSE", "NAMESPACE_ONLY", "PUBLIC" -> SkillVisibility.PUBLIC;
            case "PRIVATE" -> SkillVisibility.PRIVATE;
            default -> throw new DomainBadRequestException("error.skill.publish.visibility.invalid", rawVisibility);
        };
    }
}
