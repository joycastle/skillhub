package com.iflytek.skillhub.dto;

import java.util.List;

public record BatchPublishResponse(
        int total,
        int succeeded,
        int failed,
        int needsConfirmation,
        List<BatchPublishItemResult> items
) {}
