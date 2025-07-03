# Diffuse

Diffuse is a static risk analysis tool for code changes. It scores changes across multiple dimensions and generates clear, actionable reports to assist reviewers and reduce regression risk.


## Why Diffuse?

Existing tools don't do a good job of flagging risky changes that aren't caught by a linter. There's a huge lack of visibility into logic reuse, especially across an organization, but even within different parts of the same application's repos or monorepo.

I built this tool to mitigate:

* Small change comes through. Looks logical and passes both lint and QA, but breaks something somewhere else and nobody notices until a user report comes in.

* Devs go through and tweak logic for their own use without realizing that 5 other teams are using that logic, and now it's broken for 4 of them and everyone is submitting competing PRs. Or else another team bandaids the component so that it works for both cases, and a few years from now there's a garbled frankencomponent that's been extended and re-extended into a shambling mess.

* AI changes a ton of stuff in a single PR and it's hard to tell what's going on, but deadlines are tight and it looks pretty reasonable so someone merges it

...And so on.

## How it works

Diffuse scores changes across multiple dimensions:

* **Type safety**: Changes to return types, props, or exports. It might work for this case, but it's fairly likely to break something somewhere else out of the current scope if not carefully vetted.

* **Graph-based impact**: Widespread or critical usage across the codebase. If 47 files import a symbol, best tread very carefully when merging changes.

* **Large change**: Symbol has been meaningfully changed (over 20% of lines changed)

* **Missing test updates**: Symbol has been meaningfully changed, but tests haven't been updated. Not a breaking change in and of itself, but should be flagged. (suppress with --no-tests flag)

These factors are aggregated and assigned weighted points, then a final score is calculated, and everything is displayed in the terminal or a PR comment.

### Current Features:

- Single repository analysis
- TypeScript support
- Usage graph analysis within the repository
- Test coverage detection
- Multiple output formats (terminal, markdown)
- GitHub Actions integration

### Supported languages

TypeScript is currently the only supported language. If there's enough interest in this project, I plan to expand to fully support plain JavaScript, and then outward to Python and others.

## Installation

```bash
# Install globally
npm install -g diffuse

# Or use npx
npx diffuse --since origin/main
```

### CLI (local or CI use)
```bash
npx diffuse --since origin/main
```

### GitHub Action (runs on PRs)
Add a workflow like this:

```yaml
name: Diffuse Risk Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  analyze-risk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Diffuse
        run: |
          npx diffuse --since origin/main --format markdown > report.md
      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('report.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            });
```

### CLI Options
| Flag | Description |
|------|-------------|
| `--since <branch>` | Analyze changes since this git branch/ref |
| `--output <file>` | Write report output to a file |
| `--format <type>` | Output format: markdown or plain (default: plain) |
| `--fail-on-high-risk` | Exit with non-zero status if overall risk is high |
| `--no-suggestions` | Suppress suggestions in output |
| `--no-tests` | Exclude tests from scoring |
| `--verbose` | Enable verbose logging |
| `--help` | Show usage help |

## Demo

See Diffuse in action in under 30 seconds:

```bash
git clone https://github.com/personofnote/diffuse.git
cd diffuse/demo-app
./demo.sh
```



### Sample Output
```
🚨 RISK ANALYSIS REPORT

Git found 7 files. 5 were analyzed. 2 unsupported file extensions, 
    0 failed, 0 empty, and 0 tests were skipped

Overall Risk Score: 66.00 ⚠️ High Risk
Average Risk Score: 13.20 ✅ Low Risk

Note: This PR touches many files with individually low-risk changes.
The volume increases review complexity and regression risk.

🔥 Highest risk file to review: src/types/user.ts

📊 5 files changed · 2 with return type changes · 5 with no test deltas · 0 imported by multiple files


src/types/user.ts
Lines changed: +7/-3 (27.0% of 37 lines)
Total Score: 41.00 🟡 Medium Risk
Props changed in `User` (10.00 pts)
  -Ensure consuming components still function correctly; consider adding story/test cases.
Props changed in `CreateUserRequest` (10.00 pts)
  -Ensure consuming components still function correctly; consider adding story/test cases.
Props changed in `UpdateUserRequest` (10.00 pts)
  -Ensure consuming components still function correctly; consider adding story/test cases.
No test changes for src/types/user.ts (4.00 pts)
  -Add or update tests that reflect the changed behavior of this symbol.
Large change: +7/-3 lines (27.0% of file) (7.00 pts)
  -Large change: consider breaking up the PR or adding more tests. Review carefully.

src/components/UserCard.tsx
Lines changed: +16/-4 (35.7% of 56 lines)
Total Score: 27.00 ✅ Low Risk
Return type changed in `UserCard` (8.00 pts)
  -Review all consumers to confirm they still handle the new return shape.
Return type changed in `default` (8.00 pts)
  -Review all consumers to confirm they still handle the new return shape.
No test changes for src/components/UserCard.tsx (4.00 pts)
  -Add or update tests that reflect the changed behavior of this symbol.
Large change: +16/-4 lines (35.7% of file) (7.00 pts)
  -Large change: consider breaking up the PR or adding more tests. Review carefully.

src/api/userApi.ts
Lines changed: +4/-14 (35.3% of 51 lines)
Total Score: 11.00 ✅ Low Risk
No test changes for src/api/userApi.ts (4.00 pts)
  -Add or update tests that reflect the changed behavior of this symbol.
Large change: +4/-14 lines (35.3% of file) (7.00 pts)
  -Large change: consider breaking up the PR or adding more tests. Review carefully.

src/index.ts
Lines changed: +18/-2 (30.3% of 66 lines)
Total Score: 11.00 ✅ Low Risk
No test changes for src/index.ts (4.00 pts)
  -Add or update tests that reflect the changed behavior of this symbol.
Large change: +18/-2 lines (30.3% of file) (7.00 pts)
  -Large change: consider breaking up the PR or adding more tests. Review carefully.

src/utils/userUtils.ts
Lines changed: +7/-2 (14.1% of 64 lines)
Total Score: 4.00 ✅ Low Risk
No test changes for src/utils/userUtils.ts (4.00 pts)
  -Add or update tests that reflect the changed behavior of this symbol.

```

## Roadmap 

- Full vanilla JavaScript support
- Python support
- Configurable score weights and rules (like exempting directories from test flags)
- Subtree spread scoring (temporarily disabled until project structure conventions are better defined)
- Set up optional PR block for score over x
- Cross-repo analysis with GitHub App integration
- "Hot file" detection based on PR frequency
- Historical data analysis and trend tracking
- Advanced analytics dashboard
- Slack integration for notifications
- Project-aware risk configurations Next has unique risks compared to Vite compared to whatever 


📣 Installed Diffuse? Loved it? Hated it? [I'd love your feedback](https://docs.google.com/forms/d/e/1FAIpQLScu4x26hKju8MhxG6dhSctWDuG7A3RT0DrckzyK0E_optgZmA/viewform?usp=sharing&ouid=112100301896036939696)


