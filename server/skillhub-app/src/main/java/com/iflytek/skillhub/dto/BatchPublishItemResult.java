package com.iflytek.skillhub.dto;

import java.util.List;

public record BatchPublishItemResult(
        String filename,
        boolean success,
        boolean needsConfirmation,
        PublishResponse publish,
        String errorCode,
        String errorMessage,
        List<String> warnings
) {}
