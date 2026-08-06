# Agent instructions for this repo

## Confidentiality

- **Never reference the client or employer name** (or any bank/customer name)
  anywhere in this repository — not in code, comments, README, commit messages,
  or spec metadata. Refer to the deployment target generically as "the Apigee
  engine" or "the target Apigee integration".

## What this repo is

Jira Cloud platform REST API **v2** OpenAPI spec, split into small
self-contained OpenAPI files for deployment to an Apigee integration.

## Hard constraints on generated spec files

- `openapi: "3.0.0"` exactly (the target engine prefers 3.0.0).
- Maximum **30 operations** (path + method pairs) per file.
- Every file must be fully self-contained: no cross-file `$ref`s; carry only
  the transitively referenced `components` plus shared security schemes.
- Every file must pass `openapi-generator-cli validate` (requires Java).
- Never drop operations silently — the splitter must abort on unmapped tags.

## Conventions

- Source of truth: `source/jira-cloud-v2-openapi.json`, downloaded from
  `https://dac-static.atlassian.com/cloud/jira/platform/swagger.v3.json`
  (that URL's "v3" is the OpenAPI format version; the API itself is v2).
- One subdirectory per splitting strategy under `splits/` (e.g. `by-domain/`).
  More strategies are planned; add them to `STRATEGIES` in
  `scripts/split-spec.mjs`, output to a new `splits/<name>/` directory.
- Regenerate with `node scripts/split-spec.mjs <strategy>`.
- Output files are named `jira-v2-<group>[-partN].json` and carry an `x-split`
  provenance extension.
