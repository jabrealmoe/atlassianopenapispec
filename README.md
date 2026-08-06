# Atlassian OpenAPI Spec — Apigee-ready splits

Jira Cloud platform REST API **v2** OpenAPI spec, split into small self-contained
files sized for Apigee deployment.

## Layout

```
source/    jira-cloud-v2-openapi.json   — full upstream spec (unmodified)
scripts/   split-spec.mjs               — the splitter
splits/    one subdirectory per splitting strategy
  by-domain/                            — grouped by functional domain (28 files)
```

Each splitting strategy gets its own subdirectory under `splits/`. Additional
strategies can be added in `scripts/split-spec.mjs` (see `STRATEGIES` — a
strategy is a directory name plus a function mapping each spec tag to a group).

## Deployment constraints (Apigee)

Every generated file complies with:

- **OpenAPI 3.0.0** (`openapi: "3.0.0"` — the upstream 3.0.1 spec uses no
  3.0.1-only features, so the downgrade is a version-string change only)
- **≤ 30 operations (path + method pairs) per file**, which also guarantees
  ≤ 30 paths per file
- **Fully self-contained**: each file carries only the `components` its own
  operations transitively reference, plus the shared security schemes. No
  cross-file `$ref`s, no dangling refs.
- All files pass `openapi-generator-cli validate`.

Operations that share a tag are never split across files. Each file records its
provenance in a top-level `x-split` extension (strategy, group, part, tags).

## Regenerating

```bash
node scripts/split-spec.mjs domain   # splits/by-domain/ (default)
node scripts/split-spec.mjs tag      # splits/by-tag/ (one file per spec tag)
```

The splitter aborts (rather than silently dropping operations) if the upstream
spec introduces a tag that is not mapped in `TAG_GROUPS`.

## Refreshing the source spec

```bash
curl -sSL -o source/jira-cloud-v2-openapi.json \
  "https://dac-static.atlassian.com/cloud/jira/platform/swagger.v3.json"
```

Note: in that URL, `v3` refers to the OpenAPI *format* version. The file is the
**v2** REST API (all paths under `/rest/api/2/`). The v3 REST API lives at
`swagger-v3.v3.json`.
