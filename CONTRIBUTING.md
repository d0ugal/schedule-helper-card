# Contributing

- Work on a branch and open a pull request. Direct pushes to `main` are blocked.
- Use conventional commits (`feat:`, `fix:`, `chore:`, `docs:`). Mark breaking changes with
  `!` and a `BREAKING CHANGE:` footer, because release-please reads them to pick the version.
- Keep commits atomic: one logical change each.
- Every fix or feature needs a test that exercises it.
- Run `make lint test build` before pushing.
- Do not commit `dist/`. Releases build and attach the bundle.
