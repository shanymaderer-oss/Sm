# Security

Masa is a static site (GitHub Pages). There is no server and no user account; trips, notes and the optional Gemini key stay in the visitor's browser.

## How the site is protected

- **Content Security Policy** (in `index.html`): scripts only from this site, network requests only to the listed data services, no frames, no plugins, no form posts.
- **Trusted Types** (`js/tt.js`, loaded first): every HTML string passes one sanitizer that removes scripts, event handlers and `javascript:` links; scripts and workers load only from this site (or `blob:` for the map).
- **Escaping**: all outside text goes through `esc()`, links through `safeUrl()`, images through `cssUrl()`; `harden()` checks each rendered screen again.
- **Shared trip links** are parsed only through `cleanShared()`, a strict schema with types and length limits.
- **No third-party scripts**: MapLibre and the fonts are self-hosted, with an integrity hash on MapLibre.
- **Clickjacking**: the site will not run inside a frame on another site.
- **GitHub Actions**: actions pinned to commit hashes, form input passed as data, Dependabot watches them.

## Repository settings (owner, once)

- Two-factor authentication on the GitHub account.
- Settings → Pages → Enforce HTTPS.
- Settings → Code security: Dependabot alerts on (secret scanning and push protection are already on).
- Settings → Branches: protect `main` (no force pushes, no deletion).

## Reporting a problem

Open a private security advisory on GitHub (Security → Report a vulnerability) rather than a public issue.
