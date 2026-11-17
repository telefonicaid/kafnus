# Copilot instructions for kafnus

- The Node.js code analysed by SonarQube lives in `kafnus-ngsi/` (Node.js >= 24, CommonJS).
- Validate every change from `kafnus-ngsi/`: `npm install && npm run lint && npm test`.
- Keep the existing AGPL license header at the top of every source file.

## Fixing SonarQube issues

Issues labelled `sonarqube` are generated from SonarQube and list the findings of a single rule.

- Fix only the findings listed in the issue, without changing the behaviour of the code.
- Avoid unrelated refactors or formatting changes, so the pull request stays easy to review.
- If a finding looks like a false positive, or fixing it would change behaviour, leave it as it is and explain why in the pull request description.
- Do not edit the hidden `<!-- sonar-... -->` markers in the issue.
