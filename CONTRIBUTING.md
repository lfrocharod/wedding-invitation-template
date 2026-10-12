# Contributing

Work on a branch and open a pull request. CI lints, tests and builds every push, runs the end-to-end tests, and deploys `main` to GitHub Pages once they pass.

## Commit messages

Subjects follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, lower case, no trailing full stop, at most 72 characters. The body says what changed and why, wrapped at 72 columns. Sign your commits (`git config commit.gpgsign true`).

| Type               | For                                                                     |
| ------------------ | ----------------------------------------------------------------------- |
| `feat`             | something a guest or the couple can do or see that they couldn't before |
| `fix`              | wrong behavior made right                                               |
| `perf`, `refactor` | faster, or restructured with no change in behavior                      |
| `docs`, `test`     | documentation, tests only                                               |
| `build`, `ci`      | the build and dependencies / the workflows                              |
| `chore`            | everything else (removals, housekeeping)                                |

Scopes name the part of the site: `envelope`, `music`, `rsvp`, `apps-script`, `calendar`, `plugin`, `styles`, `e2e`. Leave the scope out for a change that spans several.

A `commit-msg` hook checks the subject when you commit. CI checks the subjects of pushed commits, and the title of each pull request, since squash-merging makes it the commit subject. History up to v2.0.0 uses the older `[ADD]` / `[IMP]` / `[FIX]` tags.

## Checks to run locally

```bash
npm run lint && npm test && npm run build
npm run test:e2e # the first run needs the browsers: npx playwright install chromium webkit
```
