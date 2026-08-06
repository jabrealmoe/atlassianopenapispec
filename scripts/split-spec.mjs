#!/usr/bin/env node
// Splits the Jira Cloud v2 OpenAPI spec into self-contained OpenAPI 3.0.0 files
// sized for Apigee deployment (max operations per file is capped).
//
// Usage: node scripts/split-spec.mjs [strategy]
//   strategy: "domain" (default) | "tag"
//
// Adding a strategy = adding an entry to STRATEGIES below: a directory name and
// a groupOf(tag) function mapping each spec tag to an output group.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const INPUT = path.join(ROOT, "source", "jira-cloud-v2-openapi.json");
const OUT_ROOT = path.join(ROOT, "splits");
const MAX_OPS_PER_FILE = 30; // Apigee deploy-tool limit: no more than 30 endpoints per file
const OPENAPI_VERSION = "3.0.0"; // target engine prefers 3.0.0

// Tag -> domain group. Every tag in the spec must appear here; unknown tags
// abort the run so a future spec update can't silently drop operations.
const TAG_GROUPS = {
  // --- issues ---
  "Issues": "issues",
  "Issue attachments": "issues",
  "Issue comments": "issues",
  "Issue comment properties": "issues",
  "Issue properties": "issues",
  "Issue remote links": "issues",
  "Issue links": "issues",
  "Issue link types": "issues",
  "Issue votes": "issues",
  "Issue watchers": "issues",
  "Issue worklogs": "issues",
  "Issue worklog properties": "issues",
  "Issue redaction": "issues",
  "Issue panels": "issues",
  "Issue navigator settings": "issues",
  // --- search & JQL ---
  "Issue search": "search",
  "JQL": "search",
  "Jira expressions": "search",
  "Group and user picker": "search",
  "Labels": "search",
  // --- fields ---
  "Issue fields": "fields",
  "Field schemes": "fields",
  "Issue field configurations": "fields",
  "Issue custom field contexts": "fields",
  "Issue custom field options": "fields",
  "Issue custom field associations": "fields",
  // --- screens ---
  "Screens": "screens",
  "Screen tabs": "screens",
  "Screen tab fields": "screens",
  "Screen schemes": "screens",
  "Issue type screen schemes": "screens",
  // --- issue config (types, priorities, resolutions, statuses) ---
  "Issue types": "issue-config",
  "Issue type schemes": "issue-config",
  "Issue type properties": "issue-config",
  "Issue priorities": "issue-config",
  "Priority schemes": "issue-config",
  "Issue resolutions": "issue-config",
  "Status": "issue-config",
  "Workflow statuses": "issue-config",
  "Workflow status categories": "issue-config",
  // --- workflows ---
  "Workflows": "workflows",
  "Workflow schemes": "workflows",
  "Workflow scheme drafts": "workflows",
  "Workflow scheme project associations": "workflows",
  "Workflow transition rules": "workflows",
  // --- projects ---
  "Projects": "projects",
  "Project avatars": "projects",
  "Project categories": "projects",
  "Project classification levels": "projects",
  "Project components": "projects",
  "Project email": "projects",
  "Project features": "projects",
  "Project key and name validation": "projects",
  "Project properties": "projects",
  "Project roles": "projects",
  "Project role actors": "projects",
  "Project types": "projects",
  "Project templates": "projects",
  "Project versions": "projects",
  // --- users & groups ---
  "Users": "users-groups",
  "User search": "users-groups",
  "User properties": "users-groups",
  "Groups": "users-groups",
  "Myself": "users-groups",
  "Avatars": "users-groups",
  // --- permissions & security ---
  "Permissions": "permissions-security",
  "Permission schemes": "permissions-security",
  "Project permission schemes": "permissions-security",
  "Issue security schemes": "permissions-security",
  "Issue security level": "permissions-security",
  "Issue notification schemes": "permissions-security",
  // --- dashboards & filters ---
  "Dashboards": "dashboards-filters",
  "Filters": "dashboards-filters",
  "Filter sharing": "dashboards-filters",
  // --- plans ---
  "Plans": "plans",
  "Teams in plan": "plans",
  // --- apps (Connect/Forge) ---
  "App properties": "apps",
  "App data policies": "apps",
  "App migration": "apps",
  "Dynamic modules": "apps",
  "Issue custom field options (apps)": "apps",
  "Issue custom field values (apps)": "apps",
  "Issue custom field configuration (apps)": "apps",
  "JQL functions (apps)": "apps",
  "UI modifications (apps)": "apps",
  "Migration of Connect modules to Forge": "apps",
  "Service Registry": "apps",
  // --- admin & misc ---
  "Jira settings": "admin",
  "Time tracking": "admin",
  "Announcement banner": "admin",
  "Application roles": "admin",
  "Audit records": "admin",
  "Classification levels": "admin",
  "License metrics": "admin",
  "Server info": "admin",
  "Tasks": "admin",
  "Webhooks": "admin",
};
const UNTAGGED = "(untagged)";

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Curated "most-used" strategy: the ~70 endpoints that carry the bulk of
// real-world Jira Cloud API traffic (integrations, scripts, marketplace apps),
// hand-grouped into usage domains. Keyed as "METHOD /path"; every key must
// exist in the source spec or the run aborts. Endpoints not listed here are
// simply excluded from this strategy's output.
const P = "/rest/api/2";
const USAGE_ENDPOINTS = {
  // --- issue-lifecycle: create/read/update/delete + transitions + meta ---
  [`POST ${P}/issue`]: "issue-lifecycle",
  [`POST ${P}/issue/bulk`]: "issue-lifecycle",
  [`GET ${P}/issue/{issueIdOrKey}`]: "issue-lifecycle",
  [`PUT ${P}/issue/{issueIdOrKey}`]: "issue-lifecycle",
  [`DELETE ${P}/issue/{issueIdOrKey}`]: "issue-lifecycle",
  [`PUT ${P}/issue/{issueIdOrKey}/assignee`]: "issue-lifecycle",
  [`GET ${P}/issue/{issueIdOrKey}/transitions`]: "issue-lifecycle",
  [`POST ${P}/issue/{issueIdOrKey}/transitions`]: "issue-lifecycle",
  [`GET ${P}/issue/createmeta`]: "issue-lifecycle",
  [`GET ${P}/issue/createmeta/{projectIdOrKey}/issuetypes`]: "issue-lifecycle",
  [`GET ${P}/issue/{issueIdOrKey}/editmeta`]: "issue-lifecycle",
  [`GET ${P}/issue/{issueIdOrKey}/changelog`]: "issue-lifecycle",
  // --- collaboration: comments, attachments, worklogs, watchers, votes ---
  [`GET ${P}/issue/{issueIdOrKey}/comment`]: "collaboration",
  [`POST ${P}/issue/{issueIdOrKey}/comment`]: "collaboration",
  [`GET ${P}/issue/{issueIdOrKey}/comment/{id}`]: "collaboration",
  [`PUT ${P}/issue/{issueIdOrKey}/comment/{id}`]: "collaboration",
  [`DELETE ${P}/issue/{issueIdOrKey}/comment/{id}`]: "collaboration",
  [`POST ${P}/issue/{issueIdOrKey}/attachments`]: "collaboration",
  [`GET ${P}/attachment/{id}`]: "collaboration",
  [`GET ${P}/attachment/content/{id}`]: "collaboration",
  [`DELETE ${P}/attachment/{id}`]: "collaboration",
  [`GET ${P}/issue/{issueIdOrKey}/worklog`]: "collaboration",
  [`POST ${P}/issue/{issueIdOrKey}/worklog`]: "collaboration",
  [`GET ${P}/issue/{issueIdOrKey}/worklog/{id}`]: "collaboration",
  [`PUT ${P}/issue/{issueIdOrKey}/worklog/{id}`]: "collaboration",
  [`DELETE ${P}/issue/{issueIdOrKey}/worklog/{id}`]: "collaboration",
  [`GET ${P}/issue/{issueIdOrKey}/watchers`]: "collaboration",
  [`POST ${P}/issue/{issueIdOrKey}/watchers`]: "collaboration",
  [`DELETE ${P}/issue/{issueIdOrKey}/watchers`]: "collaboration",
  [`POST ${P}/issue/{issueIdOrKey}/votes`]: "collaboration",
  // --- issue-graph: issue links and remote links ---
  [`POST ${P}/issueLink`]: "issue-graph",
  [`GET ${P}/issueLink/{linkId}`]: "issue-graph",
  [`DELETE ${P}/issueLink/{linkId}`]: "issue-graph",
  [`GET ${P}/issueLinkType`]: "issue-graph",
  [`GET ${P}/issue/{issueIdOrKey}/remotelink`]: "issue-graph",
  [`POST ${P}/issue/{issueIdOrKey}/remotelink`]: "issue-graph",
  [`DELETE ${P}/issue/{issueIdOrKey}/remotelink/{linkId}`]: "issue-graph",
  // --- search-and-jql ---
  [`GET ${P}/search`]: "search-and-jql",
  [`POST ${P}/search`]: "search-and-jql",
  [`GET ${P}/search/jql`]: "search-and-jql",
  [`POST ${P}/search/jql`]: "search-and-jql",
  [`POST ${P}/jql/parse`]: "search-and-jql",
  [`GET ${P}/jql/autocompletedata`]: "search-and-jql",
  [`POST ${P}/jql/match`]: "search-and-jql",
  // --- project-catalog: projects, versions, components, roles ---
  [`GET ${P}/project/search`]: "project-catalog",
  [`GET ${P}/project/{projectIdOrKey}`]: "project-catalog",
  [`POST ${P}/project`]: "project-catalog",
  [`PUT ${P}/project/{projectIdOrKey}`]: "project-catalog",
  [`GET ${P}/project/recent`]: "project-catalog",
  [`GET ${P}/project/{projectIdOrKey}/statuses`]: "project-catalog",
  [`GET ${P}/project/{projectIdOrKey}/components`]: "project-catalog",
  [`POST ${P}/component`]: "project-catalog",
  [`GET ${P}/project/{projectIdOrKey}/versions`]: "project-catalog",
  [`POST ${P}/version`]: "project-catalog",
  [`PUT ${P}/version/{id}`]: "project-catalog",
  [`GET ${P}/version/{id}`]: "project-catalog",
  [`GET ${P}/project/{projectIdOrKey}/role`]: "project-catalog",
  // --- identity-and-access: users, groups, permissions ---
  [`GET ${P}/myself`]: "identity-and-access",
  [`GET ${P}/user`]: "identity-and-access",
  [`GET ${P}/user/search`]: "identity-and-access",
  [`GET ${P}/user/assignable/search`]: "identity-and-access",
  [`GET ${P}/users/search`]: "identity-and-access",
  [`GET ${P}/groupuserpicker`]: "identity-and-access",
  [`GET ${P}/group/member`]: "identity-and-access",
  [`GET ${P}/mypermissions`]: "identity-and-access",
  [`GET ${P}/permissions`]: "identity-and-access",
  // --- metadata-essentials: the lookup tables every client caches ---
  [`GET ${P}/field`]: "metadata-essentials",
  [`GET ${P}/issuetype`]: "metadata-essentials",
  [`GET ${P}/priority`]: "metadata-essentials",
  [`GET ${P}/status`]: "metadata-essentials",
};

const STRATEGIES = {
  domain: {
    dir: "by-domain",
    groupOf: (tag) => (tag === UNTAGGED ? "admin" : TAG_GROUPS[tag]),
  },
  tag: {
    dir: "by-tag",
    groupOf: (tag) => (tag === UNTAGGED ? "untagged" : slug(tag)),
  },
  usage: {
    dir: "by-usage",
    curated: USAGE_ENDPOINTS,
  },
};

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

const strategyName = process.argv[2] ?? "domain";
const strategy = STRATEGIES[strategyName];
if (!strategy) {
  console.error(`Unknown strategy "${strategyName}". Available: ${Object.keys(STRATEGIES).join(", ")}`);
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(INPUT, "utf8"));

// --- 1. Bucket operations, preserving spec path order ------------------------
// Tag strategies bucket by the op's first tag; curated strategies bucket by an
// explicit "METHOD /path" -> group map (unlisted ops are excluded).
const opsByTag = new Map(); // bucket key -> [{path, method, op, pathItem}]
const foundCurated = new Set();
for (const [p, item] of Object.entries(spec.paths)) {
  for (const method of HTTP_METHODS) {
    const op = item[method];
    if (!op) continue;
    let key;
    if (strategy.curated) {
      const opKey = `${method.toUpperCase()} ${p}`;
      key = strategy.curated[opKey];
      if (!key) continue;
      foundCurated.add(opKey);
    } else {
      key = op.tags?.[0] ?? UNTAGGED;
      if (key !== UNTAGGED && !TAG_GROUPS[key]) {
        console.error(`Unmapped tag "${key}" — add it to TAG_GROUPS.`);
        process.exit(1);
      }
    }
    if (!opsByTag.has(key)) opsByTag.set(key, []);
    opsByTag.get(key).push({ path: p, method, op, pathItem: item });
  }
}
if (strategy.curated) {
  const missing = Object.keys(strategy.curated).filter((k) => !foundCurated.has(k));
  if (missing.length) {
    console.error("Curated endpoints not found in source spec:");
    for (const m of missing) console.error("  " + m);
    process.exit(1);
  }
}

// --- 2. Group tags per strategy, then chunk each group to MAX_OPS_PER_FILE ---
// Chunking is greedy over whole tags (largest tag is 23 ops, so tags never split
// across files) — operations sharing a tag stay together.
const groups = new Map(); // group -> [bucket key]
for (const tag of opsByTag.keys()) {
  const g = strategy.curated ? tag : strategy.groupOf(tag);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(tag);
}

function chunkTags(tags) {
  const chunks = [];
  let current = [], count = 0;
  for (const tag of tags) {
    const n = opsByTag.get(tag).length;
    if (n > MAX_OPS_PER_FILE) {
      throw new Error(`Tag "${tag}" alone has ${n} ops (> ${MAX_OPS_PER_FILE}); needs sub-tag chunking.`);
    }
    if (count + n > MAX_OPS_PER_FILE && current.length) {
      chunks.push(current);
      current = []; count = 0;
    }
    current.push(tag);
    count += n;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// --- 3. Transitive $ref closure ----------------------------------------------
function collectRefs(node, out) {
  if (Array.isArray(node)) { for (const v of node) collectRefs(v, out); return; }
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string" && node.$ref.startsWith("#/components/")) {
      out.add(node.$ref);
    }
    for (const v of Object.values(node)) collectRefs(v, out);
  }
}

function buildComponents(paths) {
  const seen = new Set();
  let frontier = new Set();
  collectRefs(paths, frontier);
  while (frontier.size) {
    const next = new Set();
    for (const ref of frontier) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const [, , type, name] = ref.split("/");
      const target = spec.components?.[type]?.[name];
      if (target === undefined) throw new Error(`Dangling ref in source spec: ${ref}`);
      collectRefs(target, next);
    }
    frontier = next;
  }
  const components = {};
  for (const ref of seen) {
    const [, , type, name] = ref.split("/");
    (components[type] ??= {})[name] = spec.components[type][name];
  }
  // security schemes are referenced by name from `security`, not by $ref
  if (spec.components?.securitySchemes) {
    components.securitySchemes = spec.components.securitySchemes;
  }
  for (const type of Object.keys(components)) {
    components[type] = Object.fromEntries(
      Object.entries(components[type]).sort(([a], [b]) => a.localeCompare(b))
    );
  }
  return components;
}

// --- 4. Emit one self-contained 3.0.0 spec per chunk -------------------------
const outDir = path.join(OUT_ROOT, strategy.dir);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const summary = [];

for (const [group, tags] of [...groups.entries()].sort()) {
  const chunks = chunkTags(tags);
  chunks.forEach((chunkTagList, i) => {
    const paths = {};
    for (const tag of chunkTagList) {
      for (const { path: p, method, op, pathItem } of opsByTag.get(tag)) {
        if (!paths[p]) {
          paths[p] = {};
          for (const [k, v] of Object.entries(pathItem)) {
            if (!HTTP_METHODS.includes(k)) paths[p][k] = v;
          }
        }
        paths[p][method] = op;
      }
    }
    const sortedPaths = Object.fromEntries(
      Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))
    );
    const part = chunks.length > 1 ? `-part${i + 1}` : "";
    const name = `jira-v2-${group}${part}`;
    const usedTags = new Set();
    for (const item of Object.values(sortedPaths)) {
      for (const m of HTTP_METHODS) item[m]?.tags?.forEach((t) => usedTags.add(t));
    }
    const out = {
      openapi: OPENAPI_VERSION,
      info: {
        ...spec.info,
        title: `${spec.info.title} - ${group}${chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : ""}`,
      },
      externalDocs: spec.externalDocs,
      servers: spec.servers,
      security: spec.security,
      tags: (spec.tags ?? []).filter((t) => usedTags.has(t.name)),
      "x-split": {
        strategy: strategyName,
        group,
        part: i + 1,
        of: chunks.length,
        tags: strategy.curated ? [...usedTags].sort() : chunkTagList,
      },
      paths: sortedPaths,
      components: buildComponents(sortedPaths),
    };
    for (const k of Object.keys(out)) out[k] === undefined && delete out[k];

    const file = path.join(outDir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    const ops = Object.values(sortedPaths).reduce(
      (n, item) => n + HTTP_METHODS.filter((m) => item[m]).length, 0
    );
    if (ops > MAX_OPS_PER_FILE) throw new Error(`${name}: ${ops} ops exceeds limit`);
    summary.push({
      file: path.relative(ROOT, file),
      paths: Object.keys(sortedPaths).length,
      operations: ops,
      schemas: Object.keys(out.components.schemas ?? {}).length,
      kb: Math.round(fs.statSync(file).size / 1024),
    });
  });
}

console.table(summary);
const totalOps = summary.reduce((n, s) => n + s.operations, 0);
console.log(`Strategy: ${strategyName} | files: ${summary.length} | total operations: ${totalOps} | max ops/file: ${Math.max(...summary.map((s) => s.operations))}`);
