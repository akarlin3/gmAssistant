# Gemini Coding Assistant Guidelines

Welcome! As a Gemini coding assistant or agent working in this repository, you must adhere to the following rules:

## 1. Automatic Task Completion and Git Workflow

When you complete a task, you MUST automatically stage, commit, and push your changes to the remote repository:
- **Stage**: Stage only the files specifically modified or created for the task (e.g., `git add <files>`). Do NOT stage unrelated untracked files (such as `.claude/` or temporary files) unless explicitly requested.
- **Commit**: Commit the changes with a clear, concise conventional commit message (e.g. `feat: ...`, `fix: ...`).
- **Push**: Push the committed changes immediately to the remote branch (`git push`).
- **Report**: Summarize the commit hash, branch name, and committed files in your final response to the user.

## 2. Technical Stack and Pro Gating
- Refer to `CLAUDE.md` for pro gating (server-side `verifyPro` + client-side `isPro` from auth context) and development details.
