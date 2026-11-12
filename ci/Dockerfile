# The browser test image (ADR 0025): Playwright's, with the browsers and their
# system libraries preinstalled. CI's verify job runs in it, reading it from
# the FROM line below through .github/workflows/ci-image.yml, so this is its
# only copy. Nothing builds this file. Dependabot proposes digest and tag
# updates, and it can be pulled to reproduce CI locally. The tag's Playwright
# version must equal the one the lockfile installs; test/ci-image.test.ts
# checks that.
FROM mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe
