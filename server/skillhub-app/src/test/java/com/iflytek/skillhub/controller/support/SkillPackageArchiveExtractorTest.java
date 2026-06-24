package com.iflytek.skillhub.controller.support;

import com.iflytek.skillhub.config.SkillPublishProperties;
import com.iflytek.skillhub.domain.skill.validation.PackageEntry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SkillPackageArchiveExtractorTest {

    private SkillPackageArchiveExtractor extractor;

    @BeforeEach
    void setUp() {
        SkillPublishProperties props = new SkillPublishProperties();
        extractor = new SkillPackageArchiveExtractor(props);
    }

    @Test
    void shouldRejectPathTraversalEntry() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "skill.zip",
            "application/zip",
            createZip("../secrets.txt", "hidden")
        );

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> extractor.extract(file));

        assertTrue(error.getMessage().contains("escapes package root"));
    }

    @Test
    void shouldRejectOversizedZipEntry() throws Exception {
        SkillPublishProperties props = new SkillPublishProperties();
        props.setMaxSingleFileSize(1024); // 1KB limit
        SkillPackageArchiveExtractor smallExtractor = new SkillPackageArchiveExtractor(props);

        byte[] content = new byte[1025]; // >1KB
        byte[] zip = createZip(Map.of("large.txt", content));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zip);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> smallExtractor.extract(file));

        assertTrue(error.getMessage().contains("File too large: large.txt"));
    }

    @Test
    void respectsConfiguredSingleFileLimit() throws Exception {
        SkillPublishProperties props = new SkillPublishProperties();
        props.setMaxSingleFileSize(5 * 1024 * 1024); // 5MB
        SkillPackageArchiveExtractor customExtractor = new SkillPackageArchiveExtractor(props);

        byte[] content = new byte[3 * 1024 * 1024]; // 3MB — under 5MB limit
        byte[] zip = createZip(Map.of("data.md", content));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zip);

        List<PackageEntry> entries = customExtractor.extract(file);
        assertEquals(1, entries.size());
    }

    @Test
    void stripsRootDirectoryWhenSingleFolder() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "my-skill/SKILL.md", "---\nname: test\n---\n".getBytes(),
                "my-skill/config.json", "{}".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);
        List<PackageEntry> entries = extractor.extract(file);

        assertTrue(entries.stream().anyMatch(e -> e.path().equals("SKILL.md")));
        assertTrue(entries.stream().anyMatch(e -> e.path().equals("config.json")));
    }

    @Test
    void canonicalizesCaseInsensitiveSkillMdAtRoot() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "skill.md", "---\nname: test\n---\n".getBytes(),
                "README.md", "# readme".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("SKILL.md")));
        assertTrue(result.entries().stream().noneMatch(e -> e.path().equals("skill.md")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void doesNotStripWhenMultipleRootEntries() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "SKILL.md", "---\nname: test\n---\n".getBytes(),
                "config.json", "{}".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);
        List<PackageEntry> entries = extractor.extract(file);

        assertTrue(entries.stream().anyMatch(e -> e.path().equals("SKILL.md")));
    }

    @Test
    void stripsRootDirectoryWhenZipHasExplicitDirEntry() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            zos.putNextEntry(new ZipEntry("my-skill/"));
            zos.closeEntry();
            zos.putNextEntry(new ZipEntry("my-skill/SKILL.md"));
            zos.write("---\nname: test\n---".getBytes());
            zos.closeEntry();
        }
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", baos.toByteArray());
        List<PackageEntry> entries = extractor.extract(file);

        assertEquals(1, entries.size());
        assertEquals("SKILL.md", entries.get(0).path());
    }

    @Test
    void doesNotStripWhenMultipleRootDirectories() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "dir-a/SKILL.md", "---\nname: test\n---\n".getBytes(),
                "dir-b/other.md", "# other".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);
        List<PackageEntry> entries = extractor.extract(file);

        assertTrue(entries.stream().anyMatch(e -> e.path().equals("dir-a/SKILL.md")));
        assertTrue(entries.stream().anyMatch(e -> e.path().equals("dir-b/other.md")));
    }

    @Test
    void keepsSiblingFilesWhenSkillMdIsInSubdirectory() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "my-skill/SKILL.md", "---\nname: test\n---\n".getBytes(),
                "my-skill/README.md", "# readme".getBytes(),
                "other.txt", "stray file".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertEquals(3, result.entries().size());
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("my-skill/SKILL.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("my-skill/README.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("other.txt")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void keepsCaseInsensitiveSkillMdPathInPackage() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "my-skill/skill.md", "---\nname: test\n---\n".getBytes(),
                "my-skill/README.md", "# readme".getBytes(),
                "other.txt", "stray file".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertEquals(3, result.entries().size());
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("my-skill/SKILL.md")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void keepsNestedPathsWhenSkillMdIsInSubdirectory() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "my-skill/SKILL.md", "---\nname: test\n---\n".getBytes(),
                "my-skill/sub/deep.md", "nested".getBytes(),
                "stray.txt", "ignored".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertEquals(3, result.entries().size());
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("my-skill/SKILL.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("my-skill/sub/deep.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("stray.txt")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void keepsAllFilesWhenSkillMdAtRoot() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "SKILL.md", "---\nname: test\n---\n".getBytes(),
                "sub/file.txt", "content".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertEquals(2, result.entries().size());
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void filtersMacOsMetadataEntries() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "my-skill/SKILL.md", "---\nname: test\n---\n".getBytes(),
                "my-skill/README.md", "# readme".getBytes(),
                "__MACOSX/my-skill/._SKILL.md", "resource fork".getBytes(),
                "my-skill/.DS_Store", "binary".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        List<PackageEntry> entries = extractor.extract(file);

        assertEquals(2, entries.size());
        assertTrue(entries.stream().noneMatch(e -> e.path().contains("MACOSX")));
        assertTrue(entries.stream().noneMatch(e -> e.path().contains(".DS_Store")));
    }

    @Test
    void realWorldMacZipWithNestedSkillMd() throws Exception {
        // Simulates: ui-ux-pro-max/uiux/SKILL.md + __MACOSX + .DS_Store + stray csv
        byte[] zipBytes = createZip(Map.of(
                "ui-ux-pro-max/uiux/SKILL.md", "---\nname: uiux\nversion: 1.0.0\n---\nBody".getBytes(),
                "ui-ux-pro-max/uiux/scripts/core.py", "# code".getBytes(),
                "ui-ux-pro-max/uiux/data/styles.csv", "col1,col2".getBytes(),
                "ui-ux-pro-max/stray.csv", "stray data".getBytes(),
                "__MACOSX/ui-ux-pro-max/._stray.csv", "resource fork".getBytes(),
                "ui-ux-pro-max/.DS_Store", "binary".getBytes(),
                "__MACOSX/._ui-ux-pro-max", "resource fork".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        // macOS files filtered, single outer folder stripped, full bundle kept
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("uiux/SKILL.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("uiux/scripts/core.py")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("uiux/data/styles.csv")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("stray.csv")));
        assertTrue(result.entries().stream().noneMatch(e -> e.path().contains("MACOSX")));
        assertTrue(result.entries().stream().noneMatch(e -> e.path().contains(".DS_Store")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void macZipWithSingleFolderAndSkillMdAtRoot() throws Exception {
        // All files under one folder, SKILL.md at folder root — simplest macOS case
        byte[] zipBytes = createZip(Map.of(
                "my-skill/SKILL.md", "---\nname: test\nversion: 1.0.0\n---\nBody".getBytes(),
                "my-skill/README.md", "# readme".getBytes(),
                "__MACOSX/my-skill/._SKILL.md", "fork".getBytes(),
                "__MACOSX/._my-skill", "fork".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertEquals(2, result.entries().size());
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("SKILL.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("README.md")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void extractWithWarningsNoSkillMdAnywhere() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "README.md", "# no skill".getBytes(),
                "config.json", "{}".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        // No SKILL.md found — entries returned as-is, validator will catch the error
        assertEquals(2, result.entries().size());
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void keepsFullBundleWhenSkillMdIsNestedDeeply() throws Exception {
        byte[] zipBytes = createZip(Map.of(
                "dist/README.md", "# distro".getBytes(),
                "dist/VERSION", "1.0.0".getBytes(),
                "dist/bin/runner", "binary".getBytes(),
                "dist/skills/html-upload/SKILL.md", "---\nname: html-upload\nversion: 1.0.0\n---\n".getBytes()
        ));
        MockMultipartFile file = new MockMultipartFile("file", "test.zip", "application/zip", zipBytes);

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertEquals(4, result.entries().size());
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("README.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("VERSION")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("bin/runner")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("skills/html-upload/SKILL.md")));
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    void extractsTarCreatedFromCurrentDirectory(@TempDir Path tempDir) throws Exception {
        Files.writeString(tempDir.resolve("SKILL.md"), "---\nname: weekly-report\nversion: 1.0.0\n---\n");
        Files.writeString(tempDir.resolve("README.md"), "# readme");
        Path tarPath = tempDir.resolve("package.tar");
        assertEquals(0, new ProcessBuilder("tar", "-cf", tarPath.toString(), ".")
                .directory(tempDir.toFile())
                .redirectErrorStream(true)
                .start()
                .waitFor());

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "weekly-report.tar",
                "application/x-tar",
                Files.readAllBytes(tarPath));

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("SKILL.md")));
        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("README.md")));
    }

    @Test
    void extractsTarGzFromMultipartStreamWithoutMarkSupport(@TempDir Path tempDir) throws Exception {
        Files.writeString(tempDir.resolve("SKILL.md"), "---\nname: weekly-report\nversion: 1.0.0\n---\n");
        Path tarGzPath = tempDir.resolve("package.tar.gz");
        assertEquals(0, new ProcessBuilder("tar", "-czf", tarGzPath.toString(), ".")
                .directory(tempDir.toFile())
                .redirectErrorStream(true)
                .start()
                .waitFor());

        byte[] payload = Files.readAllBytes(tarGzPath);
        MultipartFile file = new MultipartFile() {
            @Override
            public String getName() {
                return "file";
            }

            @Override
            public String getOriginalFilename() {
                return "weekly-report.tar.gz";
            }

            @Override
            public String getContentType() {
                return "application/gzip";
            }

            @Override
            public boolean isEmpty() {
                return payload.length == 0;
            }

            @Override
            public long getSize() {
                return payload.length;
            }

            @Override
            public byte[] getBytes() {
                return payload;
            }

            @Override
            public InputStream getInputStream() {
                return new InputStream() {
                    private int index;

                    @Override
                    public int read() {
                        return index < payload.length ? payload[index++] & 0xff : -1;
                    }

                    @Override
                    public boolean markSupported() {
                        return false;
                    }
                };
            }

            @Override
            public void transferTo(java.io.File dest) {
                throw new UnsupportedOperationException();
            }
        };

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("SKILL.md")));
    }

    @Test
    void extractsTarGzCreatedFromCurrentDirectory(@TempDir Path tempDir) throws Exception {
        Files.writeString(tempDir.resolve("SKILL.md"), "---\nname: weekly-report\nversion: 1.0.0\n---\n");
        Path tarGzPath = tempDir.resolve("package.tar.gz");
        assertEquals(0, new ProcessBuilder("tar", "-czf", tarGzPath.toString(), ".")
                .directory(tempDir.toFile())
                .redirectErrorStream(true)
                .start()
                .waitFor());

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "weekly-report.tar.gz",
                "application/gzip",
                Files.readAllBytes(tarGzPath));

        SkillPackageArchiveExtractor.ExtractionResult result = extractor.extractWithWarnings(file);

        assertTrue(result.entries().stream().anyMatch(e -> e.path().equals("SKILL.md")));
    }

    private byte[] createZip(String entryName, String content) throws Exception {
        return createZip(entryName, content.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] createZip(String entryName, byte[] content) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            ZipEntry entry = new ZipEntry(entryName);
            zos.putNextEntry(entry);
            zos.write(content);
            zos.closeEntry();
        }
        return baos.toByteArray();
    }

    private byte[] createZip(Map<String, byte[]> entries) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (Map.Entry<String, byte[]> e : entries.entrySet()) {
                ZipEntry entry = new ZipEntry(e.getKey());
                zos.putNextEntry(entry);
                zos.write(e.getValue());
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }
}
