# Company Skill Template

This is the minimal company skill package format for the first version of the internal Skill Hub.

Only `SKILL.md` is required. Optional folders such as `references/`, `examples/`, `templates/`, `scripts/`, and `assets/` may be included when the skill needs them.

## Package And Upload

Create a zip from the contents of this folder, not from its parent directory:

```bash
cd skill-template
zip -r ../weekly-report.zip .
```

Then upload the zip from the Web UI or publish it through the CLI.

## Agent Usage

Agents should download the zip, extract it inside their sandbox or mounted workspace, read `SKILL.md` first, and only read optional folders when `SKILL.md` asks for them.

Scripts are allowed as files, but the first version should not execute them automatically. The agent runtime should explicitly decide whether script execution is allowed.
