"""Generate the ARGOS report guides from the live catalogue.

Every mechanical fact on a page (key, edition, owner, capability, modules,
parameters, columns) is read from edw_gov.report_definition, so a page cannot
drift from the product. The editorial lines below are the part a generator
cannot write: what question the report answers, and what a reader needs to
know that the schema does not say.
"""
import json, os, re, pathlib

CAT = json.load(open('/root/shots/catalogue.json'))
DOCS = pathlib.Path('/root/docs')

# Reports written by hand at full depth. The generator leaves them alone.
ANCHORS = {
    'fin-trial-balance', 'fin-balance-sheet', 'fin-income-statement',
    'reg-dcfs-pr1', 'reg-dcfs-delinquency', 'risk-ecl-summary',
    'risk-stage-migration', 'gov-recon-certificate', 'gov-dq-scorecard',
    'dec-capital-scenario', 'dec-recommendation-register', 'mgmt-board-pack',
}

DOMAIN = {
    'financial':   ('Financial close',          'landmark',      'financial'),
    'regulatory':  ('Regulatory returns',       'scale',         'regulatory'),
    'ifrs9':       ('Credit risk and IFRS 9',   'trending-down', 'risk'),
    'aml':         ('AML and CFT',              'shield-alert',  'aml'),
    'member':      ('Members',                  'users',         'member'),
    'channel':     ('Channels',                 'smartphone',    'channel'),
    'operational': ('Operations',               'settings',      'operational'),
    'management':  ('Management and board',     'presentation',  'management'),
    'governance':  ('Governance and evidence',  'file-check',    'governance'),
}

TIER = {1: 'Comply', 2: 'Understand', 3: 'Anticipate', 4: 'Decide'}

# What the report answers, and the one thing a reader gets wrong.
# (question, caution or note — the note may be empty.)
ED = {
 'aml-alert-detail': ("Which alerts were raised in this period, and what happened to each one?",
   "An alert is not a suspicion. It is a rule firing. The disposition column is where judgement is recorded, and an alert closed as a false positive is evidence the rule was reviewed, not evidence it was wrong."),
 'aml-alert-summary': ("Are the detection rules producing work that is worth doing?",
   "A false-positive rate near 100% means a scenario is mistuned, not that the institution is clean. Read it beside the alert register rather than on its own."),
 'aml-cash-activity': ("Where is cash moving, and how often does it approach the reporting threshold?",
   "This counts activity, not reportable events. A transaction over the threshold here still has to be assessed before it becomes a currency transaction report."),
 'aml-pep-register': ("Who is politically exposed or high risk, and is their file current?",
   "A stale KYC refresh date on this register is the finding an examiner opens with. The column is there to be actioned, not admired."),
 'aml-screening-hits': ("What matched a sanctions or watch list, and what was decided?",
   "Real-time onboarding hits and batch rescreening hits are separated because they carry different obligations. Do not total them."),
 'aml-structuring': ("Is anyone breaking cash activity into pieces that individually stay under the threshold?",
   "Structuring is a pattern across days and branches, so this report needs a window wide enough to contain one. A narrow date range will find nothing and prove nothing."),
 'chan-adoption': ("Where do transactions actually happen, and is that changing?", ""),
 'chan-atm-performance': ("Which terminals are working, and which are costing more than they earn?", ""),
 'chan-card-activity': ("What is being spent on cards, where, and how often is it declined?", ""),
 'chan-digital-sessions': ("Are members using digital banking, and does a session lead anywhere?",
   "A session that ends without a transaction is not a failure. Balance checks are the most common reason a member signs in."),
 'chan-disputes': ("What is disputed, how much is in play, and how fast are cases closing?", ""),
 'chan-statement-cycle': ("What goes on a member's statement for this period?",
   "This is the extract behind the statement run, not the statement itself. It exists so a disputed statement can be reconstructed from the warehouse."),
 'fin-budget-variance': ("Where is the institution against budget, and which lines are driving it?", ""),
 'fin-close-status': ("Is the period ready to publish?",
   "Every feed loaded and every control reconciled is the bar. A close that is green here is the precondition for the Reconciliation Certificate, not a substitute for it."),
 'fin-fee-income': ("What did fees earn, and what was given away?",
   "The waived column is the point of this report. Fee income net of waivers is a different number from fee income, and only one of them is a policy question."),
 'fin-gl-detail': ("What actually posted to this account in this period?",
   "This is the account-level audit trail behind the trial balance. Choose the account first: with no account it has nothing to show."),
 'fin-interest-income': ("What is the loan book earning, and what are deposits costing?", ""),
 'gov-audit-trail': ("Who did what, when, and from where?",
   "The chain is hashed per workspace. A gap or an edited row breaks the chain and is visible, which is the property that makes this admissible as evidence."),
 'gov-lineage': ("Where did this figure come from?",
   "Every hop from a report column back to the source extract column. This is what answers an auditor asking how a number was produced without anyone opening the code."),
 'gov-load-batches': ("Did every extract arrive, complete?",
   "The control total the source declared against the control total the warehouse computed. These agreeing is the first thing that has to be true; nothing downstream means anything if they do not."),
 'gov-metric-definitions': ("What exactly does this metric mean?",
   "One owner-approved definition per metric, versioned. Two people quoting different delinquency ratios is a definition problem, and this is where it is settled."),
 'gov-requirements-coverage': ("Which requirements are covered, and by what evidence?",
   "Coverage is mapped at module granularity, so every requirement in a module shows the same reports as evidence. That is honest at module level and coarse at line level."),
 'risk-concentration': ("How exposed is the institution to its largest borrowers?",
   "Each exposure is shown against institutional capital, which is what the prudential limit is expressed in. A large loan is only a concentration relative to capital."),
 'risk-delinquency-aging': ("How much of the book is in arrears, and how far behind?", ""),
 'risk-member-rating': ("Do the risk ratings actually predict arrears?",
   "If members rated low risk carry the same arrears as members rated high risk, the rating model is not working. That comparison is the report."),
 'risk-rollrate': ("What happened next to the loans that were in each bucket?",
   "Roll rates out of the early buckets are the leading indicator. By the time the late buckets move, the outcome is already set."),
 'risk-vintage': ("Is recent lending performing worse than older lending at the same age?",
   "Comparing cohorts at the same months on book is what removes the effect of the book simply being younger. Reading raw delinquency by disbursement month does not."),
 'mgmt-alco': ("What does ALCO need to see about liquidity and rate risk?", ""),
 'mgmt-branch-scorecard': ("How is each branch performing across every dimension at once?", ""),
 'mgmt-growth': ("What grew, where, and by how much?", ""),
 'mgmt-kpi-trend': ("Which way are the headline ratios moving?",
   "A single reading is a number. A direction of travel is information, which is why this report exists alongside the board pack."),
 'mgmt-product-profitability': ("Which products actually contribute?",
   "Interest and fee income against interest expense, on the average balance each was earned on. A product with a large book and a thin margin can contribute less than a small one."),
 'dec-next-best-action': ("What should we offer this member next?",
   "The suggestion rests on what comparable members hold. It is a prompt for a conversation, never an approval, and nothing here commits the institution to anything."),
 'dec-retention-actions': ("Who is about to leave or slip into arrears, and what can be done about it?",
   "Every row needs a named officer before it can leave the open state. The platform raises the recommendation; a person decides it."),
 'mem-360': ("Everything the warehouse knows about one member.",
   "Choose a member first. This report is deliberately single-member: it is the view a service officer opens with a member on the phone, and it is the most heavily audited page in the product."),
 'mem-attrition-risk': ("Which members are most likely to leave?",
   "A score is a ranking, not a prediction about any one member. Work the list from the top; do not treat a score as a fact about a person."),
 'mem-campaign-list': ("Who should be on this call list?",
   "The list already excludes members who have opted out and members in arrears. That filtering is the report's job, not the caller's."),
 'mem-new-members': ("Who joined, who left, and what did they take with them?", ""),
 'mem-product-penetration': ("How many members hold each product, and how many plausibly should?", ""),
 'mem-segmentation': ("What do the institution's members actually look like?", ""),
 'ops-cash-position': ("How much cash is at each branch, and how did it get there?", ""),
 'ops-dormancy': ("What is sitting still, and for how long?",
   "Dormancy is measured on member-initiated activity. Interest postings do not reset the clock, which is the whole point."),
 'ops-exception-register': ("What is unresolved behind the published reports?",
   "Ageing is the column that matters. An exception open for a day is a workload; the same exception open for a quarter is a control failure."),
 'ops-loan-pipeline': ("Where are applications stuck, and why are they declined?", ""),
 'ops-service-cases': ("Are cases being resolved inside SLA?", ""),
 'ops-supervisor-overrides': ("What needed a supervisor, and who gave it?",
   "Every override is a control being deliberately set aside. The register exists so that setting it aside is visible afterwards."),
 'ops-teller-balancing': ("Did every teller balance?",
   "An unbalanced teller day is an exception whether the variance is over or under. A surplus is not a good outcome."),
 'ops-transaction-register': ("What posted, with every dimension attached?",
   "This is the drill-back target for most of the catalogue. When a figure elsewhere opens far enough down, it lands here."),
 'reg-boj-liquidity': ("Did liquid assets cover withdrawable deposits on every business day?",
   "The test is daily, not monthly. A month that averages comfortably above the minimum can still contain a breach, and every breach is marked."),
 'reg-capital-adequacy': ("Is institutional capital adequate against total assets?", ""),
 'reg-fatca-crs': ("Which accounts are reportable, and with what balances?", ""),
 'reg-fid-ctr': ("What cash activity has to be reported?",
   "Single transactions at or above the threshold and same-day aggregates are counted separately, because they are reported differently."),
 'reg-fid-str-support': ("What does the Financial Investigations Division need behind a suspicious transaction report?",
   "Choose the member first. The pack assembles around one subject and is designed to be handed over whole."),
 'reg-taj-wht': ("What interest was credited, and what tax was withheld on it?", ""),
}

SLUG_FIX = {'fin-trial-balance': 'combined-trial-balance'}


def slug(r):
    if r['report_key'] in SLUG_FIX:
        return SLUG_FIX[r['report_key']]
    s = r['title'].lower()
    s = s.replace('&', 'and').replace('/', ' ')
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


def sidebar(title):
    return title if len(title) <= 30 else title.split(' — ')[0][:30].rstrip()


def facts(r):
    group, icon, _ = DOMAIN[r['domain']]
    rows = [
        ('Report key', f"`{r['report_key']}`"),
        ('Edition', f"{TIER[r['min_tier']]}, tier {r['min_tier']}"),
        ('Owner', r['owner_role'] or '—'),
        ('Capability', f"`{r['required_capability']}`"),
    ]
    if r.get('frequency'):
        rows.append(('Frequency', str(r['frequency']).replace('_', ' ').capitalize()))
    rows.append(('Delivery', {'online': 'On demand', 'on_demand': 'On demand',
                              'batch': 'Batch'}.get(r['delivery_mode'],
                              str(r['delivery_mode']).replace('_', ' '))))
    if r.get('regulator'):
        rows.append(('Regulator', r['regulator']))
    if r.get('module_ref'):
        rows.append(('Modules', ', '.join(f"`{m}`" for m in r['module_ref'])))
    body = '\n'.join(f"| {k} | {v} |" for k, v in rows)
    return "| | |\n|---|---|\n" + body


def params(r):
    ps = r.get('parameters') or []
    if not ps:
        return "This report takes no parameters. Run it and it returns the current position.\n"
    out = ["| Parameter | Type | Required | Default |", "|---|---|---|---|"]
    for p in ps:
        d = p.get('default')
        d = '—' if d in (None, '') else f"`{d}`"
        out.append(f"| **{p.get('label', p['name'])}** | {p.get('type','text')} | "
                   f"{'Yes' if p.get('required') else 'No'} | {d} |")
    extra = ''
    for p in ps:
        if p.get('type') == 'select' and p.get('options'):
            opts = ', '.join(f"**{o['label']}**" for o in p['options'])
            extra += f"\n**{p.get('label', p['name'])}** offers {opts}.\n"
    return '\n'.join(out) + '\n' + extra


def columns(r):
    cs = r.get('columns') or []
    out = ["| Column | Type | Meaning |", "|---|---|---|"]
    for c in cs:
        out.append(f"| `{c['name']}` | {c.get('type','text')} | {c.get('label', c['name'])} |")
    return '\n'.join(out)


def page(r):
    group, icon, folder = DOMAIN[r['domain']]
    q, note = ED.get(r['report_key'], ('', ''))
    summary = (r['summary'] or '').strip()
    title = r['title']
    key = r['report_key']

    parts = [
        '---',
        f'title: "{title}"',
        f'sidebarTitle: "{sidebar(title)}"',
        f'description: "{summary}"',
        f'icon: "{icon}"',
        '---',
        '',
        '## What it answers',
        '',
        q,
        '',
        facts(r),
        '',
    ]
    if r['min_tier'] >= 3:
        parts += [
            '<Warning>',
            f"  This report sits at **{TIER[r['min_tier']]}**. It is "
            + ('a projection, not a record of what happened.' if r['min_tier'] == 3
               else 'a recommendation. Nothing here is a decision until a named officer records one.'),
            '</Warning>',
            '',
        ]
    parts += [
        '## Parameters',
        '',
        params(r),
        '## Running it',
        '',
        f'<Frame caption="The line under the parameters records the owner, the modules the report satisfies, '
        f'the capability it required, the row count and the time taken, and the run identifier that keys its '
        f'entry in the audit trail.">',
        f'  <img src="/images/argos/reports/{key}.png" alt="The {title} report, run for the August 2026 close." />',
        '</Frame>',
        '',
        '## Reading a row',
        '',
        columns(r),
        '',
    ]
    if note:
        parts += ['<Note>', f'  {note}', '</Note>', '']
    if r.get('disclaimer'):
        parts += ['<Warning>', f"  {r['disclaimer']}", '</Warning>', '']
    parts += [
        '## Exports and evidence',
        '',
        'Every run writes a row to the audit trail with the run identifier shown above, the parameters used, '
        'the row count and who ran it. The **CSV**, **XLSX**, **PDF** and **JSON** buttons export exactly the '
        'rows on screen, so an export and its audit entry always agree. **Definition** opens the report '
        'definition this page describes.',
        '',
    ]
    return '\n'.join(parts) + '\n'


def main():
    written, skipped = [], []
    for r in CAT:
        if r['report_key'] in ANCHORS:
            skipped.append(r['report_key']); continue
        if r['report_key'] not in ED:
            skipped.append(r['report_key'] + ' (no editorial)'); continue
        _, _, folder = DOMAIN[r['domain']]
        path = DOCS / 'argos' / 'reports' / folder / f'{slug(r)}.mdx'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(page(r))
        written.append(str(path.relative_to(DOCS)))
    print(f'written {len(written)}, skipped {len(skipped)}')
    for s in skipped:
        print('  skip', s)
    return written


if __name__ == '__main__':
    main()
