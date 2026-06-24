-- JoyHub department skill repositories (organizational categories).

UPDATE namespace
SET display_name = 'JoyHub公共库',
    description = 'Joy 公司公共技能库'
WHERE slug = 'global';

INSERT INTO namespace (slug, display_name, type, description, status)
VALUES
    ('hr-yuanqi', 'HR元气中心', 'TEAM', 'HR元气中心技能仓库', 'ACTIVE'),
    ('gestalt', '格式塔工作室', 'TEAM', '格式塔工作室技能仓库', 'ACTIVE'),
    ('maiqu', '麦趣工作室', 'TEAM', '麦趣工作室技能仓库', 'ACTIVE'),
    ('lab', 'Lab', 'TEAM', 'Lab 技能仓库', 'ACTIVE'),
    ('jc-arsenal', 'JC弹药库', 'TEAM', 'JC弹药库技能仓库', 'ACTIVE'),
    ('horizon', '地平线工作室', 'TEAM', '地平线工作室技能仓库', 'ACTIVE')
ON CONFLICT (slug) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    status = 'ACTIVE';
