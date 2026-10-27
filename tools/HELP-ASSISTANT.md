# Ask LOS Help: the documentation assistant

A floating help button on every page of the docs site. On LOS pages (`/omnia/los/...`) it reads **Ask LOS Help**; everywhere else it reads **Ask for help**. It answers from the documentation itself, entirely in the browser, and cites the page and section every answer came from.

No server. No API key. No network requests.

## Files

| File | What it is | Edit by hand? |
|---|---|---|
| `help-assistant.js` | The widget and the retrieval engine. Injects its own CSS. | Yes |
| `help-index.js` | The generated search index. Defines `window.LOS_HELP_INDEX`. | No, regenerate it |
| `tools/build-help-index.mjs` | Builds `help-index.js` from the `.mdx` pages. | Yes |
| `tools/HELP-ASSISTANT.md` | This file. | Yes |

## How Mintlify loads it

Mintlify includes every `.js` file in the content directory on every page, runs it after the page becomes interactive, and gives no guaranteed order between files ([Mintlify: Custom scripts](https://www.mintlify.com/docs/customize/custom-scripts)). So:

- Both `.js` files sit at the repo root. Nothing in `docs.json` references them.
- `help-index.js` may run before or after `help-assistant.js`. The assistant mounts immediately and builds its engine the moment `window.LOS_HELP_INDEX` exists (it also listens for the `los-help-index-ready` event the index fires). A question asked before the index arrives is queued, not dropped.
- The `.mjs` files in `tools/` are not `.js`, so Mintlify does not load them as page scripts.
- Mintlify navigates client-side. The assistant checks the path every 600 ms to switch its label between **Ask LOS Help** and **Ask for help**, and re-attaches itself if a page transition removes it.

## Rebuild the index

Run this after any change to page content, from the repo root:

```bash
node tools/build-help-index.mjs
```

It prints the page count, section count and payload size. It is idempotent: unchanged content produces a byte-identical `help-index.js` and prints `unchanged`. `node tools/build-help-index.mjs --check` prints the stats without writing. Node 18 or later, no dependencies.

Commit `help-index.js` with the content change. A stale index still works but answers from the old text and can link to anchors that no longer exist.

### What the builder does

1. Walks every `.mdx` file, skipping `node_modules`, `.git`, `snippets`, `tools`, `images`, `drafts` and anything matched by `.mintignore`.
2. Strips frontmatter (keeping `title`, `sidebarTitle`, `description`), imports, JSX tags and Markdown syntax. It keeps headings, table rows (a checkmark row becomes "Action: Role, Role"), Frame captions, and Step, Card and Accordion titles. Mermaid blocks are dropped; other code blocks are kept, capped at 300 characters.
3. Splits each page into sections at H2 and H3. The text before the first H2 is the page's intro section.
4. Computes each heading's anchor exactly as Mintlify renders it. Mintlify does not use GitHub-style slugs: `Credit quality & pricing panel` is `#credit-quality-&-pricing-panel`, a duplicate `Approve` is `#approve-2`, and `Why a count turns amber?` is `#why-a-count-turns-amber`. The algorithm is a copy of `@mintlify/common` `slugify` + `cleanHeadingId`, and was checked against the real Mintlify functions for all 748 headings on the site with zero mismatches (26 October 2026, mint CLI 4.2.1134).
5. Tags each page by product: `los` for `omnia/los/**`, otherwise the top-level directory (`omnia`, `atlas`, `kairos`, `aptos`, `argos`), or `home`.
6. Writes the index, keeping the shipped total (`help-index.js` + `help-assistant.js`) under 600 KB. LOS pages are always indexed in full. If the full site does not fit, other products' sections and the LOS changelog are capped in steps (1,600 characters, then 900, then the first paragraph). If LOS alone exceeds the budget the build warns and still writes the file.

## How it answers

1. **Query expansion.** The question is tokenised, stop words dropped, words lightly stemmed (`voided` and `voiding` both match `void`). A synonym map adds the words the docs use for what staff say: TDSR, LTV, KYC, GCT, AML, MFA, "approval limit", "queue count", amber, void, signed document, password, reassign, paper loans, and more. Synonyms count at under half the weight of the reader's own words. The map is `SYNONYMS` in `help-assistant.js`.
2. **Ranking.** BM25 over every section, with the heading weighted three times the body. Sections on the product you are reading get a boost, the changelog and event-name tables are demoted, and "Who can..." questions favour sections that name roles.
3. **The answer card.** The best section's 2 to 4 consecutive sentences that carry the most of the question's rare terms, with those terms highlighted, the section heading as a link, and a **Source** line linking to `/page#anchor`.
4. **Related.** Up to 4 more sections, other pages first.
5. **Ask next.** Up to 3 follow-ups taken from neighbouring headings on the answer's page and the related sections. Clicking one opens exactly that section.
6. **Low confidence.** If the best match is weak the card says "No exact match. This is the closest section in the documentation." If nothing matches at all, it says so and offers the starter questions.

History lives in memory for the current page view. The refresh button in the panel header starts over.

### Tuning

All tuning lives at the top of `help-assistant.js`: `STARTERS` (the starter questions per context), `SYNONYMS`, and the boosts inside `search()`. `window.LOS_HELP.answer("question")` in the browser console returns the answer the widget would show, which is the fastest way to check a change.

## Accessibility and theming

- The launcher is a real button with `aria-expanded` and `aria-controls`. The panel is `role="dialog"` with `aria-modal="true"` and a label.
- Focus moves to the input on open, Tab and Shift+Tab are trapped inside the panel, Esc closes it and returns focus to where it was.
- Answers are appended to a `role="log"` region with `aria-live="polite"`.
- Colours are CSS variables on `#los-help`, switched when `html` carries Mintlify's `dark` class.
- Under 640 px wide the panel becomes a bottom sheet at 85% of the viewport height. The input uses a 16 px font so iOS does not zoom.

## Optional AI mode

Off by default. To turn it on, define a config object before or alongside the assistant, for example in a new root-level `help-config.js`:

```js
window.LOS_HELP_CONFIG = {
  aiEndpoint: 'https://help-api.compuzign.com/ask', // required to enable AI mode
  aiTimeoutMs: 15000, // optional, default 15000
  aiContexts: 5,      // optional, passages sent per question, default 5
};
```

The config is read at question time, so file order does not matter. Never put a key or token in this object: everything in it is public. The endpoint holds the model key server-side, the way any server-side assistant keeps its model API key in its server environment.

With AI mode on, each question still runs the local search first. The top passages go to the endpoint, its answer appears in a panel labelled **AI summary of the sources below**, and the local answer card with its cited source, related links and follow-ups still renders underneath. If the endpoint errors, times out, or returns no `answer`, the reader sees the local answer alone, with no error message.

### Endpoint contract

`POST {aiEndpoint}` with `Content-Type: application/json`, no cookies (`credentials: 'omit'`).

Request body:

```json
{
  "question": "Who can approve this loan?",
  "page": "/omnia/los/introduction",
  "product": "los",
  "contexts": [
    {
      "id": 1,
      "product": "los",
      "page": "Approval authority, routes and committees",
      "section": "Who can claim a loan for approval",
      "url": "https://docs.compuzign.com/omnia/los/workflows/approval-routes#who-can-claim-a-loan-for-approval",
      "text": "Plain text of the section, up to 2,400 characters."
    }
  ]
}
```

Response, `200` with `Content-Type: application/json`:

```json
{
  "answer": "Plain text. Paragraphs separated by a blank line. Up to 4,000 characters are shown.",
  "citations": [1]
}
```

- `answer` is rendered as plain text, never HTML. Markdown is not interpreted.
- `citations` is optional: the `id`s of the contexts the answer relied on. It is accepted and kept for a later release; today the cited sources shown are the local answer's.
- Any non-2xx status, invalid JSON, or an empty `answer` falls back to the local answer.

What the server must do:

1. **Answer only from `contexts`.** Instruct the model to use only the supplied passages and to say it does not know when they do not cover the question. Do not let it invent capabilities, roles or figures.
2. **Follow the site's voice rules** in the system prompt. Copy the Terminology and Hard formatting sections of `AGENTS.md` into it: no multi-tenancy vocabulary, the product is the Loan Origination System or LOS and never the internal repository name, Credit Officer not "Loan Officer", the seven role names exactly, no em-dashes.
3. **CORS.** Allow `POST` and the `Content-Type` header from `https://docs.compuzign.com` (and the preview domain if you use one). Answer the `OPTIONS` preflight.
4. **Protect the key and the bill.** Keep the model key in the server environment, rate-limit per IP, cap `question` at 300 characters (the input already does) and the total context size.
5. **Respond within the timeout** (15 s by default).

A minimal server for the endpoint:

```js
app.post('/ask', async (req, res) => {
  const { question, contexts } = req.body || {};
  if (typeof question !== 'string' || !Array.isArray(contexts)) return res.status(400).end();
  const sources = contexts.map((c) => `[${c.id}] ${c.page} > ${c.section}\n${c.text}`).join('\n\n');
  const prompt = `Answer the question using only these documentation passages. ` +
    `If they do not answer it, say so. Cite passage numbers in brackets.\n\n${sources}\n\nQuestion: ${question}`;
  try {
    const answer = await callModel(prompt); // Gemini, Claude, or any model; key from process.env
    res.json({ answer, citations: [...new Set((answer.match(/\[(\d+)\]/g) || []).map((m) => Number(m.slice(1, -1))))] });
  } catch {
    res.status(502).end(); // the widget falls back to the local answer
  }
});
```

If the site is ever served with a Content Security Policy, the endpoint's origin must be in its `connect-src`. Mintlify's custom-scripts page does not document a CSP for hosted sites; check the response headers before going live.

## Testing

Mintlify's `mint dev` needs to download its preview client from `releases.mintlify.com` on first run. Where that host is reachable, run `mint dev`, open any page, and the button is bottom right. Otherwise load both files in a plain HTML page served from the repo root: the assistant has no dependency on Mintlify's markup, only on `location.pathname` and the `dark` class on `html`.
