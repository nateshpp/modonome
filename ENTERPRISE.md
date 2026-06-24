# Enterprise estates

Enterprise software rarely lives in one clean Git repo. Modonome treats the adoption target
as the system-of-change boundary: the place where source, configuration, metadata, tests,
release evidence, and approvals are controlled. Sometimes that is GitHub. Sometimes it is a
mainframe SCM, a package-platform transport stream, an ALM workspace, or a metadata export
mirrored into a review repo.

## Today versus Milestone 4

Modonome is v0.1-alpha. Be clear about what ships now and what is planned. The table below
is the vision for every estate type. Most of those estates do not yet have a built-in
adapter. Read it as the destination, not the current feature list.

What works today, on any estate, through mirror mode and dry-run:

- Read-only adoption pass over exported source, config, metadata, and evidence.
- Dry-run mapping of modernization work, debt themes, and gate gaps.
- Owner-reviewable proposal generation with no write action against the platform.
- Local state, packets, and metrics produced from those reads.

What requires the Milestone 4 enterprise estate adapters (see `ROADMAP.md`):

- Platform-specific write-back into mainframe, SAP, Oracle, Salesforce, and ServiceNow.
- Transport-aware proposals, ACL risk review, and metadata diff as built-in gate evidence.
- An owner-gated write-back path for platforms with no ordinary Git change flow.

Until those adapters land, the rows below for non-Git platforms describe mirror-mode reads
and proposals only. Deployment stays with the platform's own release process.

## Adoption surfaces

| Estate | Adoption surface | Safe first use |
| --- | --- | --- |
| Product app repo | Git files, CI, tests, issues, code owners | Dry-run map, test hardening, small modernization PRs |
| Monorepo | Package graph, owners, affected-test tooling | Bounded packets per package or capability |
| Microservice estate | Service catalog, API contracts, deploy metadata | Cross-service debt themes and contract-test gaps |
| Mainframe | COBOL, JCL, copybooks, schedules, exported SCM metadata | Read-only modernization map, job-flow evidence |
| SAP | ABAP, CDS, transports, extensions, change documents | Transport-aware proposals, evidence gaps |
| Oracle | PL/SQL, forms, reports, EBS or Fusion extensions | Dependency and release-evidence mapping |
| Salesforce | Metadata, Apex, flows, profiles, deploy pipeline | Metadata diff review, test coverage gaps |
| ServiceNow | Scoped apps, update sets, flows, scripts, ACLs | Update-set evidence, ACL risk review |
| Low-code or RPA | Exported metadata, bot scripts, run history | Fragile workflow detection, owner-gated proposals |
| Data or BI | SQL, dbt, notebooks, lineage, scheduler config | Lineage-backed quality gates, migration sequencing |

## Mirror mode

When the platform has no ordinary Git change flow, Modonome starts in mirror mode: read
exports, build an adoption map, identify modernization work, and produce owner-reviewable
proposals. Direct write-back into a proprietary platform requires platform-specific gates,
test evidence, rollback evidence, and owner approval. Until then, Modonome files proposals,
produces packets, updates local state, and leaves deployment to the platform's release
process.

## Cross-repo learning

Repos that opt in can share minimized, classified, provenance-backed knowledge packets. The
network is advisory and off by default. A pattern learned in one repo is a candidate
elsewhere until the local repo validates it through its own gates and owners. There is no
central authority that can merge, arm, or override a repo. See the network module in the
prompt and `schemas/knowledge-packet.schema.json`.

## Support

Modonome is MIT-licensed and free to use. For enterprise deployment questions, integration
help, or to discuss support arrangements, open an issue or start a discussion on the
[GitHub repository](https://github.com/nateshpp/modonome). Commercial support options are
on the roadmap for v0.2.
