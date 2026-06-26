# ADR-029: Adversarial Test Design Principles

Status: Accepted

## Context

Existing 16 scenarios test known attack vectors but were designed without adversary-aware
thinking (an attacker who knows the test suite could engineer bypasses).

## Decision

New scenarios (AP-17..AP-22) target adversary-aware gaps: file rename evasion,
multi-line config attacks, homoglyph evasion, assertion dilution. Each scenario documents
(a) the attack, (b) the control, (c) the adversary model, (d) known limitations.

The six new scenarios are:
- **AP-17**: Multi-line coverage zeroing (splitting threshold manipulation across lines)
- **AP-18**: File rename evasion (renaming test files to avoid ratchet detection)
- **AP-19**: TestNG `enabled=false` injection (disabling tests via framework config)
- **AP-20**: Assertion strength downgrade (replacing strong assertions with weaker ones)
- **AP-21**: Batch assertion collapse (advisory; collapsing multiple assertions into one)
- **AP-22**: Unicode homoglyph bypass (using look-alike characters to evade string matching)

## Consequences

- **Positive**: Scenarios now model attacker knowledge rather than attack patterns alone.
- **Negative**: Some gaps remain (documented as known limitations): multi-line string-literal
  attacks that span file boundaries and homoglyph attacks in non-UTF-8-normalized inputs
  are not yet covered.
