# Documentation project instructions

## About this project

- This is the CNS documentation site, built on [Mintlify](https://mintlify.com).
- Pages are MDX files with YAML frontmatter. Configuration lives in `docs.json`.
- Run `mint dev` to preview locally. Run `mint broken-links` to check links.
- The brand is **CNS**. The loan platform is documented under a single tab named **LOS** (Loan Origination System). The site is structured so other Compuzign products can join later as sibling tabs.

## Terminology (non-negotiable)

- Call the product the **Loan Origination System** or **LOS**. Never call it "iLoan". The string "iLoan" must not appear anywhere in the docs, including titles, frontmatter, and image alt text. The internal repository is named `cns-iloan`, but that name stays out of user-facing docs.
- The capture role is **Credit Officer**, never "Loan Officer".
- The seven built-in roles are exactly: Tenant Administrator, Credit Officer, Adjudicator, Securities, Disbursement, Credit Manager, Branch Manager. Do not invent roles (there is no "Lead").
- Use "member" for the credit union customer, "staff" for credit union employees, "tenant" or "workspace" for a credit union on the platform.
- Capability strings are dot-notation and must match the codebase exactly (for example `members.documents.view`, plural `members`). When in doubt, check `packages/shared/src/capabilities.ts` in the `cns-iloan` repo.

## Style preferences (voice)

Write like a sharp human wrote it, never like AI output.

- Write to "you". Reserve "we" for "we operate the service so you do not have to".
- Open every page with one flat sentence that says what the thing is or does. Never "In this guide", "This document covers", "Let's dive in", "By the end you will".
- Stack short declarative sentences. Use deliberate fragments for emphasis ("No config. No setup.").
- Be specific and opinionated: exact numbers, exact defaults, named exceptions. No hedging ("generally", "typically", "it depends", "recommended") and no filler transitions ("Additionally", "Furthermore", "It's worth noting").
- Answer a question flatly. Lead with "Yes." or "No.", then explain.
- Headings are short noun phrases or literal user questions. Sentence case. Bold the term being defined or the operative verb.
- Bold for UI elements: click **Settings**. Code formatting for file names, commands, paths, capability strings, and code references.

## Hard formatting rules

- No em-dashes ("—") and no hyphen used as a separator in prose. Rewrite "X — Y" as "X. Y", or fold it in with "is", "which", a colon, or "like". Hyphens in genuine compound modifiers (real-time, on-prem) are fine.
- No ASCII diagrams, box-drawing, or ASCII art ever. Use a real image inside `<Frame caption="...">` pointing at `/images/...`, or a Mermaid diagram.
- No bare `{ }` or `< >` in prose (MDX reads them as expressions or tags). Use UPPER_SNAKE_CASE placeholders and escape stray angle brackets as `&lt;` / `&gt;`.
- Every page has frontmatter with `title`, `description`, and where useful a `sidebarTitle` and an `icon` from the Lucide library.

## Content boundaries

- Document the user-facing and admin-facing behavior of the platform. Pull facts from the `cns-iloan` codebase rather than guessing.
- Do not document features that are not built. The disbursement redesign (fees and GCT, payment rails, payee types, saved payees, dual control, AML screening, settlement lifecycle, per-officer limits, auto-disbursement) is built and lives on the disbursement branch. Plan documents (for example biometric KYC) are not shipped and should not be presented as live.
