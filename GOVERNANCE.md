# Governance

Modonome treats autonomy as something to be earned, one rung at a time.

## Maker, checker, merger

Every change needs three distinct identities:

- A maker that creates the diff.
- A checker that did not create the diff. The checker runs the gates first, then reviews the
  diff and the rationale. A persuasive rationale is evidence, not a verdict.
- A merge authority that is not the author.

If only one identity or model is available, autonomous checking and merging are disabled and
the change waits for human review.

## Risk tiers

- Tier 1: mechanical, small, test-fenced, no protected paths. Local maker and checker.
- Tier 2: multi-file but bounded, no public contracts. Stronger checker, full gates.
- Tier 3: public API, schema, migration, dependency, security, CI, auth, secrets, protected
  docs. Owner or frontier review.
- Tier 4: new product claims, architecture, policy, legal, market positioning, autonomous
  merge enablement, cross-repo changes. Owner decision only.

## The activation ladder

1. Disabled. Read state, produce plans, change nothing.
2. Dry-run. Project actions, record metrics, take no write action.
3. Shadow. Run against live state read-only, compare decisions against human outcomes.
4. Armed. Allowed only when every gate below passes.

Each rung is earned by a clean record on the rung before it.

## Arming gates

Armed mode requires all of: branch protection or equivalent enforcement, required CI checks,
code-owner review, a verified trusted author, protected-path rules, a separate merge identity,
a daily merge cap above zero, a remote budget cap, and a rollback path. The arming levers are
read from the environment or CI.

## Owner decisions

Open questions live in `.modonome/DECISIONS.md`. Each carries a recommendation and a default
of hold. Unanswered means no action.

## Current maintainer structure

Modonome is v0.1-alpha with a single maintainer. The CODEOWNERS file assigns @nateshpp to
every path. We state this plainly because the tool sells separation of duties, and one person
holding all the keys is the exact gap a careful reader should flag.

Here is the mitigation. The governance model is not a private policy. It is open and auditable:

- The spec is public. The prompt, schemas, and rules ship in the repo.
- The ratchet and validators are open source. Anyone can read how a gate decides pass or fail.
- The CI enforcement lives in code, not in a person's discretion. Branch protection, required
  checks, and protected-path rules run the same way for everyone, including the maintainer.

So the trust does not rest on one person being careful. It rests on rules that any contributor
can read, run, and challenge.

Here is the path forward. As the project earns contributors, we move from one owner to several:

- Split CODEOWNERS so prompts, schemas, and scripts each have a dedicated owner review.
- Require a second owner on Tier 3 and Tier 4 changes once a second owner exists.
- Nominate co-owners through the contribution process. A sustained record of merged reviews
  earns a path to owner review on a path, then to a CODEOWNERS entry.

We will not claim a governance board or a multi-owner review that does not exist yet. This
section will change as the maintainer set grows, and the change will be visible in Git history.

## Learning

Lessons are captured only on a real correction signal, staged in `.modonome/LEARNINGS.md`,
bounded and dated and evidence-backed, and promoted into canonical rules only by an owner.
Promotion deletes the staged entry and, where it fits, adds a deterministic gate.
