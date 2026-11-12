# Security policy

`@hussmartinez/pdf-sdk` opens PDF files from anywhere: email attachments, downloads, user uploads. Its promise is that those files are processed on the user's device and never leave it. A vulnerability here can break that promise inside every application that embeds it, so reports are among the most valuable this project can receive. Thank you for taking the time to report one privately.

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion.**

Report it through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**, or go directly to [the advisory form](https://github.com/ie-huss-martinez/pdf-sdk/security/advisories/new). Only the maintainer can see the report.

Please include:

- the affected version, or the commit;
- what an attacker can do, and under which conditions;
- steps to reproduce it, or a proof of concept. If it needs a crafted PDF, attach it to the private report. Never attach a real document that contains personal or confidential data.

## What to expect

- **Acknowledgement** within 7 days.
- **Updates** at least every 14 days until the issue is resolved.
- **A fix and an advisory.** Once a fix is released, a GitHub Security Advisory describes the issue, with a CVE where it applies. You're credited in the advisory unless you'd rather not be.
- **Coordinated disclosure.** Please keep the issue private until the advisory is published, or for 90 days after your report, whichever comes first. If a fix needs longer, we'll agree on a date with you.

## Supported versions

The package is pre-1.0. Security fixes go into the latest release only. No version has been published yet.

## Scope

In scope is everything in this repository: `@hussmartinez/pdf-sdk`, its workers and bundled engines, the workflows that verify and release it, and the published package. Examples:

- a PDF that runs script in the host page or a worker, or makes the SDK insert file-derived text as HTML;
- a PDF that freezes or crashes the page, or exhausts memory, despite the file policy's limits ([ADR 0004](docs/adr/0004-pdf-limits.md)), or that parses outside a worker;
- any network request the SDK makes, including requests that pdf.js would make for fonts, CMaps or decoders ([ADR 0002](docs/adr/0002-workers-and-assets.md));
- file names, contents, form values or annotation text reaching the host's `onEvent`, or anything else that leaks document data;
- encryption that is weaker than documented, or an exported file that keeps content the user removed, such as a deleted page;
- styles from the standalone script that change the host page outside the editor ([ADR 0005](docs/adr/0005-element-in-the-light-dom.md));
- anything that requires a weaker Content Security Policy than documented, such as `unsafe-eval`;
- weaknesses in the build, release or publishing workflows, such as unpinned actions, excessive permissions, or a bundled engine that doesn't match its pinned version or hash ([ADR 0001](docs/adr/0001-pdf-engines.md)).

The SDK bundles pdf.js, qpdf and pdf-lib. **A known vulnerability in a bundled engine is in scope** when the SDK's latest release still ships the affected version, because applications can only get the fix from us.

Out of scope:

- vulnerabilities in an engine that are already public and fixed in the SDK's latest release. Report new engine vulnerabilities to us, and upstream too: privately to [pdf.js](https://github.com/mozilla/pdf.js/security/advisories/new) and [qpdf](https://github.com/qpdf/qpdf/security/advisories/new). [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) has no private channel, so we coordinate with its maintainers;
- issues that need an already compromised device, browser or build environment;
- a PDF that is merely slow within the configured limits, or that renders differently from another viewer. Report those as public issues;
- accessibility defects. They matter just as much, but report them as a public issue so they can be fixed in the open.

Vulnerabilities in the shared runtime or the design system go to their repositories' security policies: [sdk-core's](https://github.com/ie-huss-martinez/sdk-core/security/policy) and [ui's](https://github.com/ie-huss-martinez/ui/security/policy).
