---
name: weekly-report
description: Turn rough work notes into a structured weekly report.
version: 1.0.0
---

# Weekly Report Skill

## What This Skill Does

This skill helps an agent turn rough work notes into a clear weekly report.

## When To Use

Use this skill when the user wants to:

- summarize weekly work;
- organize messy notes;
- write a manager-facing update;
- create a professional report.

## When Not To Use

Do not use this skill for:

- legal documents;
- financial statements;
- public company announcements.

## Instructions For Agent

1. Read the user's rough notes.
2. Identify completed work, ongoing work, blockers, and next steps.
3. Group related items together.
4. Do not invent missing information.
5. If information is unclear, mark it as "To be confirmed".
6. Write in a clear and professional tone.

## Optional References

Read these files only if the task needs them:

- `references/report-style-guide.md`: use this when the user asks for a manager-facing report.
- `templates/weekly-report-template.md`: use this when the user asks for the standard output format.

## Output Format

```markdown
# Weekly Report

## Completed This Week

## In Progress

## Blockers

## Next Week's Plan
```
