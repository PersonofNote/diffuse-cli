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

### Planned features
Cross-repo analysis in particular would really help this project, but requires infrastructure, and may need to be reserved for an eventual pro tier. Also hot file analysis, flagging when a file has been involved in a bunch of recent PRs. Possibly trend graphs if that's not overkill/info exhaustion.

- Full vanilla JavaScript support
- Multi-language support
- ✅ Configurable score weights and rules (like exempting directories from test flags)
- Subtree spread scoring (temporarily disabled until project structure conventions are better defined)
- Set up optional PR block for score over x
- Cross-repo analysis with GitHub App integration
- "Hot file" detection based on PR frequency
- Historical data analysis and trend tracking
- Advanced analytics dashboard
- Slack integration for notifications
- Project-aware risk configurations Next has unique risks compared to Vite compared to whatever
- Caching and large-repo optimizations 

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
| `--config <file>` | Path to configuration file |
| `--format <type>` | Output format: markdown or plain (default: plain) |
| `--fail-on-high-risk` | Exit with non-zero status if overall risk is high |
| `--no-suggestions` | Suppress suggestions in output |
| `--no-tests` | Exclude tests from scoring |
| `--verbose` | Enable verbose logging |
| `--help` | Show usage help |

## Configuration

Diffuse supports extensive configuration to customize risk scoring, thresholds, and analysis behavior. Configuration can be provided via:

- `diffuse.config.json` or `diffuse.config.js` in your project root
- `.diffuserc.json` or `.diffuserc.js` in your project root  
- `diffuse` key in your `package.json`
- `--config <file>` CLI option to specify a custom path

### Configuration Options

```json
{
  "riskWeights": {
    "PROPS_CHANGED": 15,
    "RETURN_TYPE_CHANGED": 12,
    "MISSING_TEST": 6,
    "LARGE_CHANGE": 10
  },
  "thresholds": {
    "highRisk": 70,
    "mediumRisk": 45,
    "veryHighRisk": 90,
    "largeChangePercentage": 25
  },
  "exclusions": {
    "files": ["*.generated.ts", "*.d.ts"],
    "directories": ["vendor", "third-party"],
    "testPatterns": ["*.integration.test.ts"]
  },
  "analysis": {
    "includeTestCoverage": true,
    "includeUsageGraph": true,
    "maxFilesInGraph": 1000
  },
  "reporting": {
    "includeSuggestions": true,
    "verboseStats": false,
    "suggestions": {
      "PROPS_CHANGED": "Custom suggestion: Review all component consumers and update prop types accordingly."
    }
  }
}
```

#### Risk Weights
Customize the point values assigned to different risk factors:
- `PROPS_CHANGED`: Points for TypeScript interface/type changes (default: 10)
- `RETURN_TYPE_CHANGED`: Points for function return type changes (default: 8) 
- `MISSING_TEST`: Points when tests aren't updated for changed code (default: 4)
- `LARGE_CHANGE`: Points for files with significant line changes (default: 7)

#### Thresholds
Configure risk level boundaries:
- `highRisk`: Score threshold for high risk classification (default: 60)
- `mediumRisk`: Score threshold for medium risk classification (default: 40)
- `veryHighRisk`: Score threshold for very high risk classification (default: 80)
- `largeChangePercentage`: Percentage of file changes to trigger large change penalty (default: 20)

#### Exclusions
Specify files and directories to exclude from analysis:
- `files`: Glob patterns for files to exclude
- `directories`: Glob patterns for directories to exclude  
- `testPatterns`: Additional test file patterns beyond defaults

#### Analysis Settings
Control analysis behavior:
- `includeTestCoverage`: Whether to analyze test coverage (default: true)
- `includeUsageGraph`: Whether to build usage dependency graph (default: true)
- `maxFilesInGraph`: Limit files analyzed in usage graph for performance

#### Reporting Options
Customize report output:
- `includeSuggestions`: Show actionable suggestions (default: true)
- `verboseStats`: Show detailed file statistics (default: false)
- `suggestions`: Override default suggestion messages for risk factors
- For full configuration, see `diffuse.config.example.json`

### Example Usage with Config

```bash
# Use default config file locations
npx diffuse --since origin/main

# Specify custom config file
npx diffuse --since origin/main --config ./custom-diffuse.config.json

# Config in package.json
{
  "diffuse": {
    "thresholds": {
      "highRisk": 50
    }
  }
}
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


📣 Installed Diffuse? Loved it? Hated it? [I'd love your feedback](https://docs.google.com/forms/d/e/1FAIpQLScu4x26hKju8MhxG6dhSctWDuG7A3RT0DrckzyK0E_optgZmA/viewform?usp=sharing&ouid=112100301896036939696)

## Current Limitations and Known Edge Cases

Diffuse is in active development. I'll update this list as I implement features, but for now see below.

### Language Support

- **TypeScript Only**: Currently, Diffuse only fully supports TypeScript files. JavaScript files are partially supported but with reduced type analysis capabilities.
- **No Support for Other Languages**: Python, Ruby, Java, and other languages are not currently supported.

### Git Integration

- **Git Dependency**: Diffuse requires git to be installed and properly configured.
- **Git Version Compatibility**: Tested primarily with Git 2.x. Older or newer versions might have compatibility issues.
- **Large Repositories**: Performance may degrade with very large git repositories or extensive commit histories.
- **Detached HEAD State**: Analysis might be incomplete when running in a detached HEAD state.
- **Shallow Clones**: Limited functionality with shallow git clones as historical data might be missing.

### TypeScript Analysis

- **Export-Focused**: Analysis primarily focuses on exported declarations. Internal changes that don't affect exports might be missed.
- **Complex Type Features**: Advanced TypeScript features like conditional types, mapped types, or complex type inference might not be fully analyzed.
- **Type Widening/Narrowing Detection**: The tool attempts to detect type widening and narrowing but might miss complex cases.
- **JSX/TSX Limitations**: While JSX/TSX files are supported, some React-specific patterns might not be fully analyzed.

### Test Detection

- **Conventional Test Patterns**: Test detection relies on conventional naming patterns (`*.test.ts`, `*.spec.ts`, `__tests__/`, etc.).
- **Custom Test Frameworks**: Projects using unconventional test file organization might see false positives in "missing test" warnings.
- **Test Coverage Analysis**: The tool checks for test file changes but doesn't perform actual test coverage analysis.

### Performance Considerations

- **Memory Usage**: Building the usage graph for large codebases can be memory-intensive.
- **Analysis Time**: Initial analysis might be slow for very large projects.
- **File Count Limits**: While there's a `maxFilesInGraph` configuration option, very large projects might still experience performance issues.

### Scoring and Risk Assessment

- **Subjective Weights**: The default risk weights are based on common patterns but might need adjustment for your specific project.
- **Threshold Tuning**: Risk level thresholds (high, medium, low) might need tuning based on your team's risk tolerance.
- **False Positives**: Some changes might be flagged as risky even when they're intentional and well-tested.
- **Context Awareness**: The tool doesn't understand the semantic meaning of your code or business logic.

### File System and Path Handling

- **Path Normalization**: While the tool attempts to normalize paths, there might be edge cases on different operating systems.
- **Special Characters**: Files with special characters in paths might not be handled correctly.
- **Symlinks**: Limited support for symlinked files or directories.

### Configuration

- **Limited Validation**: Configuration options have limited validation, so incorrect values might lead to unexpected behavior.
- **Default Settings**: Default settings are optimized for typical TypeScript projects but might not be ideal for all project types.

### Error Handling

- **Dependency Errors**: I assume that anyone using the tool has Git and Typescript set up, and issues with Git or the TypeScript compiler might not produce clear error messages.

### Monorepo Support

- **Single Repository Focus**: Diffuse is designed to analyze a single repository at a time for now.
- **Limited Workspace Awareness**: In monorepos, cross-package dependencies might not be fully analyzed.

## Planned Improvements

Many of these limitations are on our roadmap for improvement:

- Support for additional languages
- Improved performance for large codebases
- Better monorepo support
- Enhanced test coverage analysis
- Cross-repository dependency analysis

## Reporting Issues

If you encounter behavior that seems incorrect or have suggestions for improvements, please [open an issue](https://github.com/personofnote/diffuse/issues) with a detailed description and, if possible, a minimal reproduction case.

