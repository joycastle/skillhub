package com.iflytek.skillhub.dto;

public record SkillRepositoryResponse(
        String slug,
        String displayName,
        boolean defaultRepository
) {
}
