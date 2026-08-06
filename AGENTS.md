# Agent instructions for this repo

## Confidentiality

- **Never reference the client or employer name** (or any bank/customer name)
  anywhere in this repository — not in code, comments, README, commit messages,
  or spec metadata. Refer to the deployment target generically as "the Apigee
  engine" or "the target Apigee integration".

## Goals of this project

This repo produces Apigee-consumable OpenAPI files from Atlassian's Jira Cloud
REST API spec. The upstream spec is one ~2.3 MB file with 607 operations —
far too large to upload and deploy as a single Apigee proxy. The goal is a
repeatable pipeline that:

1. Takes the upstream spec unmodified (`source/`).
2. Splits it into small, fully self-contained OpenAPI 3.0.0 files that each
   deploy cleanly through the Apigee upload/deploy tooling.
3. Supports multiple splitting strategies side by side, so different
   consumption scenarios can be compared and optimized (by functional domain,
   by expected traffic, and more to come — at least three additional
   strategies are planned).

### Why the v2 API

The **v2** REST API is used as the experimentation baseline. It is
functionally equivalent to v3 for proxy-shape purposes but uses plain-text
bodies rather than v3's Atlassian Document Format, which keeps payload schemas
simpler while the splitting strategies and Apigee deployment flow are worked
out. Once the pipeline is proven on v2, the same splitter should apply to the
v3 spec (`swagger-v3.v3.json`) with minimal change — nothing in this repo may
hard-code assumptions that only hold for v2 beyond the `jira-v2-` file naming
and `/rest/api/2/` paths that come from the source spec itself.

### How the output is consumed

The files under `splits/<strategy>/` are the deliverable. Each file is
uploaded to the Apigee engine by a separate deploy tool (not in this repo) and
becomes an independently deployable API surface. That drives every constraint
below: files must be individually valid, self-contained (Apigee resolves no
cross-file refs), within the engine's size/endpoint limits, and stable in
content so proxies don't shift unexpectedly between regenerations. Choose the
strategy directory per scenario — e.g. `by-usage/` covers the curated top-70
highest-traffic endpoints for a minimal high-value deployment; `by-domain/`
covers the full 607-operation surface grouped by functional area.

## Hard constraints on generated spec files

- `openapi: "3.0.0"` exactly (the target engine prefers 3.0.0).
- Maximum **30 operations** (path + method pairs) per file.
- Every file must be fully self-contained: no cross-file `$ref`s; carry only
  the transitively referenced `components` plus shared security schemes.
- Every file must pass `openapi-generator-cli validate` (requires Java).
- Never drop operations silently — the splitter must abort on unmapped tags
  (tag strategies) or on curated endpoints missing from the source spec
  (curated strategies).

## Conventions

- Source of truth: `source/jira-cloud-v2-openapi.json`, downloaded from
  `https://dac-static.atlassian.com/cloud/jira/platform/swagger.v3.json`
  (that URL's "v3" is the OpenAPI format version; the API itself is v2).
- One subdirectory per splitting strategy under `splits/` (e.g. `by-domain/`,
  `by-usage/`). Add strategies to `STRATEGIES` in `scripts/split-spec.mjs`;
  each outputs to its own `splits/<name>/` directory. Two strategy kinds
  exist: tag-based (function mapping spec tags to groups, full coverage) and
  curated (explicit `"METHOD /path" -> group` map, partial coverage).
- Regenerate with `node scripts/split-spec.mjs <strategy>`.
- Output files are named `jira-v2-<group>[-partN].json` and carry an `x-split`
  provenance extension (strategy, group, part, tags).
- Commit messages follow Conventional Commits.
