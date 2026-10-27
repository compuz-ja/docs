# Documentation project instructions

## About this project

- This is the CompuZign documentation site, built on [Mintlify](https://mintlify.com).
- Pages are MDX files with YAML frontmatter. Configuration lives in `docs.json`.
- Run `mint dev` to preview locally. Run `mint broken-links` to check links.
- The site is organised by the CompuZign portfolio. Each product is a `products` entry in `docs.json` with its own accent colour, and every page lives under that product's directory.

## The portfolio (read this before naming anything)

CompuZign has five marks. Getting the relationship between them right is the most important thing in this repository, because the product documentation is where a reader learns what the portfolio actually is.

| Mark | What it is | Directory |
|---|---|---|
| **CompuZign ATLAS** | The delivery framework. Architecture, Technology, Lifecycle, Automation, Services. The methodology every CompuZign platform is designed, built, automated and run under. | `atlas/` |
| **CompuZign KAIROS** | Infrastructure as a service. Compute, storage, SAN fabric, virtualization and the cloud-native runtime, across the data centre footprint. | `kairos/` |
| **CompuZign APTOS** | Support as a service. Managed services, professional services, cybersecurity, the Global Support Centre of Excellence, NOC and SOC, ITSM. | `aptos/` |
| **CompuZign OMNIA** | Digital banking. Core banking in partnership with Profile Software Finuevo, plus the Loan Origination System, onboarding, mobile and online banking, and Core Banking Migration as a Service. | `omnia/` |
| **CompuZign ARGOS** | The enterprise data warehouse. Governed reporting for credit unions, reconciled to the general ledger. | `argos/` |

**ATLAS is never a product name.** It is not something an institution buys, subscribes to, or logs into. Never write "the ATLAS platform", "ATLAS EDW", "ATLAS LOS", or anything that presents ATLAS as software. A reader should come away knowing that ATLAS is *how* CompuZign delivers, and that KAIROS, APTOS, OMNIA and ARGOS are *what* it delivers.

**The data warehouse is ARGOS, not ATLAS EDW.** The platform carried the wrong name until release 1.0.13, and older documents, some screenshots and the repository name still say ATLAS EDW. In documentation it is ARGOS.

**LOS is a service within OMNIA, not a peer of it.** The Loan Origination System sits under `omnia/los/`. The same will be true of onboarding, mobile and online banking, and migration services as they are documented.

## Terminology (non-negotiable)

### Everywhere on this site

- **Never expose multi-tenancy.** Do not write "tenant", "multi-tenant", "per-tenant" or "cross-tenant" in prose, on any product. A credit union has its own private **workspace** (LOS) or is called **the institution** or **your credit union** (ARGOS). Staff should never read that they are a "tenant". The only exception is literal code identifiers, which keep their real names and go in code font: the LOS capability `admin.tenant.manage` and the models `TenantConfig` / `TenantBranding` / `TenantWorkflowOverride`; the ARGOS function `edw_app.current_tenant()` and the column `tenant_id`.
- Use **member** for the credit union's customer and **staff** for credit union employees.
- Capability strings are dot-notation and must match the codebase exactly. When in doubt, check the source rather than guessing.

### OMNIA and LOS

- Call the product the **Loan Origination System** or **LOS**. Never "iLoan". The string "iLoan" must not appear anywhere in the docs, including titles, frontmatter and image alt text. The internal repository is named `cns-iloan`, and that name stays out of user-facing docs.
- The capture role is **Credit Officer**, never "Loan Officer".
- The seven built-in roles are exactly: Administrator, Credit Officer, Adjudicator, Securities, Disbursement, Credit Manager, Branch Manager. The admin role is **Administrator**, never "Tenant Administrator". Do not invent roles: there is no "Lead".
- **workspace** is a credit union's isolated account on the platform.
- Capability strings live in `packages/shared/src/capabilities.ts` in the `cns-iloan` repository.

### ARGOS

- The platform is **CompuZign ARGOS**, or **ARGOS** after first mention. Not "ARGOS EDW", not "the EDW platform", not "ATLAS EDW".
- The customer is **the institution** or **the credit union**. The demonstration institution is **Meridian Co-operative Credit Union**, which is not a real credit union and is described as a demonstration wherever its figures appear.
- The four analytics editions are exactly **Comply**, **Understand**, **Anticipate** and **Decide**, tiers 1 to 4. Each answers one question: what happened, why it happened, what happens next, what we should do. Never call them plans, packages or licences.
- A report is identified by its **report key** in code font, for example `fin-trial-balance`. Report keys are stable and are what a reader quotes when asking for help.
- Warehouse objects keep their real names in code font: `edw_mart.trial_balance`, `edw_gov.drill_source`, `edw_app.recommendation`.
- Figures in report guides come from the demonstration warehouse and are labelled as such. Never present demonstration figures as an institution's own.

## Style preferences (voice)

Write like a sharp human wrote it, never like AI output.

- Write to "you". Reserve "we" for "we operate the service so you do not have to".
- Open every page with one flat sentence that says what the thing is or does. Never "In this guide", "This document covers", "Let's dive in", "By the end you will".
- Stack short declarative sentences. Use deliberate fragments for emphasis ("No config. No setup.").
- Be specific and opinionated: exact numbers, exact defaults, named exceptions. No hedging ("generally", "typically", "it depends", "recommended") and no filler transitions ("Additionally", "Furthermore", "It's worth noting").
- Answer a question flatly. Lead with "Yes." or "No.", then explain.
- Headings are short noun phrases or literal user questions. Sentence case. Bold the term being defined or the operative verb.
- Bold for UI elements: click **Settings**. Code formatting for file names, commands, paths, capability strings, report keys and code references.

## Hard formatting rules

- No em-dashes and no hyphen used as a separator in prose. Rewrite as two sentences, or fold it in with "is", "which", a colon, or "like". Hyphens in genuine compound modifiers (real-time, on-prem, zero-data-loss) are fine.
- No ASCII diagrams, box-drawing, or ASCII art ever. Use a real image inside `<Frame caption="...">` pointing at `/images/...`, or a Mermaid diagram.
- No bare `{ }` or `< >` in prose (MDX reads them as expressions or tags). Use UPPER_SNAKE_CASE placeholders and escape stray angle brackets as `&lt;` / `&gt;`.
- Every page has frontmatter with `title`, `description`, and where useful a `sidebarTitle` and an `icon` from the Lucide library.

## Images and screenshots

- Screenshots live under `images/PRODUCT/`, for example `images/argos/`. Keep the product prefix so a file is never ambiguous.
- Capture at a fixed width so figures across a product look like one set. ARGOS captures at 1500 CSS pixels at 2x device scale, then downsamples to 1500px wide.
- Crop to what the caption talks about. A full-page screenshot with one relevant row in it makes the reader do the work.
- Every screenshot sits in `<Frame caption="...">`, and the caption says what to look at rather than what the picture is of.
- Alt text describes the content for a reader who cannot see it, and never contains a product name that breaks the terminology rules above.

## Content boundaries

- Document the user-facing and admin-facing behaviour of the platform. Pull facts from the relevant codebase rather than guessing.
- Do not document features that are not built. Where something is planned, say so and name the release it is expected in, or leave it out.
- Check facts taken from a whitepaper or a sales document against the current state before repeating them. Documents are written at a point in time and go stale. As of this writing the ATLAS whitepaper of July 2026 still names Calico rather than Cilium, still calls the seven-platform reference architecture the "Omnia Enterprise Platform", still names Temenos alongside Profile Software, and predates ARGOS entirely.
