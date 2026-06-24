package com.iflytek.skillhub.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
@ConfigurationProperties(prefix = "skillhub.repositories")
public class SkillRepositoryProperties {

    private String defaultSlug = "global";
    private boolean openPublish = true;
    private List<RepositoryDefinition> catalog = defaultCatalog();

    public String getDefaultSlug() {
        return defaultSlug;
    }

    public void setDefaultSlug(String defaultSlug) {
        this.defaultSlug = defaultSlug;
    }

    public boolean isOpenPublish() {
        return openPublish;
    }

    public void setOpenPublish(boolean openPublish) {
        this.openPublish = openPublish;
    }

    public List<RepositoryDefinition> getCatalog() {
        return catalog;
    }

    public void setCatalog(List<RepositoryDefinition> catalog) {
        this.catalog = catalog == null ? defaultCatalog() : catalog;
    }

    public Set<String> publishableSlugs() {
        LinkedHashSet<String> slugs = new LinkedHashSet<>();
        for (RepositoryDefinition definition : catalog) {
            if (definition.slug() != null && !definition.slug().isBlank()) {
                slugs.add(definition.slug().trim());
            }
        }
        return slugs;
    }

    public boolean isOpenPublishSlug(String slug) {
        return openPublish && slug != null && publishableSlugs().contains(slug);
    }

    private static List<RepositoryDefinition> defaultCatalog() {
        List<RepositoryDefinition> items = new ArrayList<>();
        items.add(new RepositoryDefinition("global", "JoyHub公共库", true));
        items.add(new RepositoryDefinition("hr-yuanqi", "HR元气中心", false));
        items.add(new RepositoryDefinition("gestalt", "格式塔工作室", false));
        items.add(new RepositoryDefinition("maiqu", "麦趣工作室", false));
        items.add(new RepositoryDefinition("lab", "Lab", false));
        items.add(new RepositoryDefinition("jc-arsenal", "JC弹药库", false));
        items.add(new RepositoryDefinition("horizon", "地平线工作室", false));
        return items;
    }

    public record RepositoryDefinition(String slug, String displayName, boolean defaultRepository) {
    }
}
