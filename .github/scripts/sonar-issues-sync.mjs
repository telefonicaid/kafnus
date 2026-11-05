/*
 * Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 *
 * This file is part of kafnus
 *
 * kafnus is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * kafnus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with kafnus. If not, see http://www.gnu.org/licenses/.
 */

/*
 * Syncs the open SonarQube issues of this project into GitHub issues:
 *   - one parent issue with a summary of the backlog;
 *   - one sub-issue per Sonar rule (split in batches when large), self-contained
 *     so it can be assigned to Copilot coding agent or to a person.
 *
 * Sonar is only read (a token with Browse permission is enough). GitHub is
 * written with the workflow's GITHUB_TOKEN. Security findings and hotspots are
 * never published, only counted.
 *
 * Environment:
 *   SONAR_HOST_URL     Sonar base URL (defaults to sonar.host.url in sonar-project.properties)
 *   SONAR_READ_TOKEN   Sonar token with Browse permission on the project (not the analysis token)
 *   GITHUB_TOKEN       Token with issues:write (only read in dry-run mode, optional there)
 *   GITHUB_REPOSITORY  owner/repo
 *   DRY_RUN            Anything but "false" means dry-run (nothing is written to GitHub)
 *   SYNC_PREVIEW_DIR   Optional, directory where the generated issue bodies are written
 *   GITHUB_STEP_SUMMARY  Optional, set by Actions
 *
 * Configuration: .github/sonar-issues-sync.json
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(REPO_ROOT, '.github', 'sonar-issues-sync.json');
const SONAR_PROPERTIES_PATH = join(REPO_ROOT, 'sonar-project.properties');

const BASE_LABEL = 'sonarqube';
const PARENT_MARKER = '<!-- sonar-sync:parent -->';
const RULE_MARKER_RE = /<!-- sonar-sync:rule=(\S+) -->/;
const KEYS_MARKER_RE = /<!-- sonar-keys: ([^>]*) -->/;
const PARENT_TITLE = 'SonarQube: issues backlog';

const SEVERITY_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, BLOCKER: 4 };
// Legacy (pre-MQR) severities mapped to the MQR scale
const LEGACY_SEVERITY = { INFO: 'INFO', MINOR: 'LOW', MAJOR: 'MEDIUM', CRITICAL: 'HIGH', BLOCKER: 'BLOCKER' };
const LEGACY_TYPE_QUALITY = { BUG: 'RELIABILITY', VULNERABILITY: 'SECURITY', CODE_SMELL: 'MAINTAINABILITY' };
const QUALITY_LABEL_COLOR = { MAINTAINABILITY: 'c5def5', RELIABILITY: 'fbca04', SECURITY: 'd93f0b' };

const DEFAULT_CONFIG = {
    ignoredRules: [],
    ignoredPaths: [],
    minSeverity: 'INFO',
    excludeQualities: ['SECURITY'],
    maxFindingsPerIssue: 25,
    maxOpenSubIssues: 5,
    maxRuleDescriptionChars: 20000
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function loadConfig(text) {
    const cfg = { ...DEFAULT_CONFIG, ...JSON.parse(text) };
    if (!(cfg.minSeverity in SEVERITY_RANK)) {
        throw new Error(
            `Invalid minSeverity "${cfg.minSeverity}", use one of ${Object.keys(SEVERITY_RANK).join(', ')}`
        );
    }
    for (const key of ['maxFindingsPerIssue', 'maxOpenSubIssues']) {
        if (!Number.isInteger(cfg[key]) || cfg[key] < 1) {
            throw new Error(`${key} must be a positive integer`);
        }
    }
    return cfg;
}

export function parseProperties(text) {
    const props = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([^#!\s=][^=]*?)\s*=\s*(.*?)\s*$/);
        if (m) props[m[1]] = m[2];
    }
    return props;
}

/** Minimal glob: `**` any path, `*` any chars but `/`, `?` one char but `/`. */
export function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') {
            i++;
            if (glob[i + 1] === '/') {
                i++;
                re += '(?:.*/)?';
            } else {
                re += '.*';
            }
        } else if (c === '*') {
            re += '[^/]*';
        } else if (c === '?') {
            re += '[^/]';
        } else {
            re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${re}$`);
}

/** Primary impact of a Sonar issue: the one with the highest severity. */
export function classify(issue) {
    if (Array.isArray(issue.impacts) && issue.impacts.length > 0) {
        const top = [...issue.impacts].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
        return {
            quality: top.softwareQuality,
            severity: top.severity,
            qualities: issue.impacts.map((i) => i.softwareQuality)
        };
    }
    const quality = LEGACY_TYPE_QUALITY[issue.type] || 'MAINTAINABILITY';
    return { quality, severity: LEGACY_SEVERITY[issue.severity] || 'INFO', qualities: [quality] };
}

export function componentPath(component, projectKey) {
    const prefix = `${projectKey}:`;
    return component.startsWith(prefix) ? component.slice(prefix.length) : component;
}

/** Splits the open Sonar issues into publishable findings and counters of what was left out. */
export function filterFindings(issues, cfg, projectKey) {
    const ignoredPaths = cfg.ignoredPaths.map(globToRegExp);
    const ignoredRules = new Set(cfg.ignoredRules);
    const excludedQualities = new Set(cfg.excludeQualities);
    const minRank = SEVERITY_RANK[cfg.minSeverity];
    const published = [];
    let security = 0;
    let ignored = 0;

    for (const issue of issues) {
        const { quality, severity, qualities } = classify(issue);
        if (qualities.includes('SECURITY')) security++;
        const path = componentPath(issue.component, projectKey);
        if (
            qualities.some((q) => excludedQualities.has(q)) ||
            ignoredRules.has(issue.rule) ||
            ignoredPaths.some((re) => re.test(path)) ||
            SEVERITY_RANK[severity] < minRank
        ) {
            if (!qualities.includes('SECURITY')) ignored++;
            continue;
        }
        published.push({
            key: issue.key,
            rule: issue.rule,
            quality,
            severity,
            path,
            startLine: issue.textRange?.startLine ?? issue.line ?? null,
            endLine: issue.textRange?.endLine ?? issue.line ?? null,
            message: issue.message || ''
        });
    }
    return { published, security, ignored };
}

export function groupByRule(findings) {
    const groups = new Map();
    for (const f of findings) {
        if (!groups.has(f.rule)) groups.set(f.rule, []);
        groups.get(f.rule).push(f);
    }
    for (const list of groups.values()) {
        list.sort(
            (a, b) =>
                a.path.localeCompare(b.path) || (a.startLine ?? 0) - (b.startLine ?? 0) || a.key.localeCompare(b.key)
        );
    }
    return groups;
}

/** Highest severity and its quality across the findings of one rule. */
export function ruleSummary(findings) {
    const top = [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    return { quality: top.quality, severity: top.severity, count: findings.length };
}

export function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

/** Recognises the GitHub issues managed by this script. */
export function parseSyncIssue(ghIssue) {
    const body = ghIssue.body || '';
    const base = {
        number: ghIssue.number,
        id: ghIssue.id,
        title: ghIssue.title,
        body,
        locked: (ghIssue.assignees || []).length > 0
    };
    if (body.includes(PARENT_MARKER)) return { ...base, kind: 'parent' };
    const rule = body.match(RULE_MARKER_RE);
    if (!rule) return null;
    const keys = body.match(KEYS_MARKER_RE);
    const keySet = new Set(
        keys
            ? keys[1]
                  .split(',')
                  .map((k) => k.trim())
                  .filter(Boolean)
            : []
    );
    return { ...base, kind: 'rule', rule: rule[1], keys: keySet };
}

/**
 * Decides what to do for every rule.
 *  - Assigned sub-issues are never edited; their findings are not re-published.
 *    They are closed only when Sonar no longer reports any of their findings.
 *  - The remaining findings are split in batches, reusing unassigned sub-issues
 *    first, then creating new ones while under maxOpenSubIssues.
 */
export function computePlan({ groups, existing, openSonarKeys, cfg }) {
    const byRule = new Map();
    for (const issue of existing) {
        if (!byRule.has(issue.rule)) byRule.set(issue.rule, []);
        byRule.get(issue.rule).push(issue);
    }
    for (const list of byRule.values()) list.sort((a, b) => a.number - b.number);

    const rules = new Set([...groups.keys(), ...byRule.keys()]);
    const perRule = [];
    for (const rule of rules) {
        const findings = groups.get(rule) || [];
        const issues = byRule.get(rule) || [];
        const locked = issues.filter((i) => i.locked);
        const unlocked = issues.filter((i) => !i.locked);

        const closes = [];
        const kept = [];
        const takenKeys = new Set();
        for (const issue of locked) {
            const stillOpen = [...issue.keys].filter((k) => openSonarKeys.has(k));
            if (stillOpen.length === 0) {
                closes.push(issue);
            } else {
                kept.push(issue);
                stillOpen.forEach((k) => takenKeys.add(k));
            }
        }

        const remaining = findings.filter((f) => !takenKeys.has(f.key));
        const batches = chunk(remaining, cfg.maxFindingsPerIssue);
        const updates = [];
        const creates = [];
        batches.forEach((batch, i) => {
            const part = batches.length > 1 ? { index: i + 1, total: batches.length } : null;
            if (i < unlocked.length) updates.push({ issue: unlocked[i], findings: batch, part });
            else creates.push({ findings: batch, part });
        });
        closes.push(...unlocked.slice(batches.length));

        perRule.push({
            rule,
            findings,
            summary: findings.length ? ruleSummary(findings) : null,
            kept,
            updates,
            creates,
            closes,
            pending: []
        });
    }

    // Most severe and largest rules first, so the cap lets the important ones in
    perRule.sort((a, b) => {
        const sa = a.summary ? SEVERITY_RANK[a.summary.severity] : -1;
        const sb = b.summary ? SEVERITY_RANK[b.summary.severity] : -1;
        return sb - sa || (b.summary?.count ?? 0) - (a.summary?.count ?? 0) || a.rule.localeCompare(b.rule);
    });

    let open = perRule.reduce((n, r) => n + r.kept.length + r.updates.length, 0);
    for (const r of perRule) {
        const allowed = [];
        for (const c of r.creates) {
            if (open < cfg.maxOpenSubIssues) {
                allowed.push(c);
                open++;
            } else {
                r.pending.push(c);
            }
        }
        r.creates = allowed;
    }
    return perRule;
}

function escapeMd(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');
}

function titleCase(value) {
    return value ? value.charAt(0) + value.slice(1).toLowerCase() : '';
}

export function findingLink(f, repo, revision) {
    let anchor = '';
    if (f.startLine) {
        anchor = f.endLine && f.endLine !== f.startLine ? `#L${f.startLine}-L${f.endLine}` : `#L${f.startLine}`;
    }
    const label = f.startLine ? `${f.path}:${f.startLine}` : f.path;
    return `[\`${label}\`](https://github.com/${repo}/blob/${revision}/${f.path}${anchor})`;
}

const SECTION_TITLES = {
    introduction: 'Introduction',
    root_cause: 'Why is this an issue?',
    assess_the_problem: 'What is the potential impact?',
    how_to_fix: 'How to fix it',
    resources: 'Resources'
};

export function renderRuleDescription(rule, maxChars) {
    if (!rule) return '';
    let html = '';
    if (Array.isArray(rule.descriptionSections) && rule.descriptionSections.length > 0) {
        for (const section of rule.descriptionSections) {
            const ctx = section.context?.displayName ? ` (${section.context.displayName})` : '';
            html += `<h3>${SECTION_TITLES[section.key] || section.key}${ctx}</h3>\n${section.content}\n`;
        }
    } else if (rule.htmlDesc) {
        html = rule.htmlDesc;
    }
    if (html.length > maxChars) {
        html = `${html.slice(0, maxChars)}\n<p><em>(Description truncated, see the rule in SonarQube.)</em></p>`;
    }
    return html;
}

export function renderTitle(ruleKey, rule, part) {
    const name = rule?.name ? `: ${rule.name}` : '';
    const suffix = part ? ` (part ${part.index}/${part.total})` : '';
    return `[Sonar] ${ruleKey}${name}${suffix}`;
}

export function renderSubIssueBody({ ruleKey, rule, findings, ctx }) {
    const { quality, severity } = ruleSummary(findings);
    const ruleUrl = `${ctx.sonarUrl}/coding_rules?open=${encodeURIComponent(ruleKey)}&rule_key=${encodeURIComponent(
        ruleKey
    )}`;
    const lines = [
        `<!-- sonar-sync:rule=${ruleKey} -->`,
        `## SonarQube rule \`${ruleKey}\`${rule?.name ? ` — ${escapeMd(rule.name)}` : ''}`,
        '',
        `**Software quality:** ${titleCase(quality)} · **Severity:** ${titleCase(severity)} · **Findings:** ${
            findings.length
        }`,
        '',
        '### Task',
        '',
        'Fix the SonarQube findings listed below. All of them break the same rule, described at the end of this issue.',
        '',
        '### Findings',
        '',
        ...findings.map((f) => `- ${findingLink(f, ctx.repo, ctx.revision)} — ${escapeMd(f.message)}`),
        '',
        '### Acceptance criteria',
        '',
        '- Every finding listed above is fixed, without changing the behaviour of the code.',
        '- The change is limited to these findings (no unrelated refactors).',
        '- `cd kafnus-ngsi && npm install && npm run lint && npm test` passes.',
        ''
    ];
    const description = renderRuleDescription(rule, ctx.maxRuleDescriptionChars);
    if (description) {
        lines.push('<details>', '<summary>Rule description</summary>', '', description, '</details>', '');
    }
    lines.push(
        '---',
        `<sub>Generated by \`.github/workflows/sonar-issues-sync.yml\` from the SonarQube analysis of \`${ctx.revision.slice(
            0,
            7
        )}\`. ` +
            `[Rule in SonarQube](${ruleUrl}). This issue is rewritten on every sync until it is assigned; ` +
            'it is closed automatically when SonarQube no longer reports its findings. Do not edit the hidden markers.</sub>',
        `<!-- sonar-keys: ${findings.map((f) => f.key).join(',')} -->`
    );
    return lines.join('\n');
}

export function renderParentBody({ plan, stats, rules, ctx, refs }) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const published = plan.reduce((n, r) => n + r.findings.length, 0);
    const pendingFindings = plan.reduce((n, r) => n + r.pending.reduce((m, p) => m + p.findings.length, 0), 0);
    const lines = [
        PARENT_MARKER,
        '## SonarQube issues backlog',
        '',
        'This issue tracks the open SonarQube findings of this repository. Each sub-issue groups the findings ' +
            'of one Sonar rule and is self-contained, so it can be assigned to Copilot coding agent or to a person.',
        '',
        `**Last sync:** ${now} UTC · **Analysis:** \`${ctx.revision.slice(0, 7)}\`${
            ctx.analysisDate ? ` (${ctx.analysisDate})` : ''
        } · ` + `[SonarQube dashboard](${ctx.sonarUrl}/dashboard?id=${encodeURIComponent(ctx.projectKey)})`,
        '',
        '### Overview',
        '',
        '| | Findings |',
        '|---|---:|',
        `| Open in SonarQube | ${stats.total} |`,
        `| Published in sub-issues | ${published - pendingFindings} |`,
        `| Waiting for a free slot (max ${ctx.maxOpenSubIssues} open sub-issues) | ${pendingFindings} |`,
        `| Security (not published here) | ${stats.security} |`,
        `| Security hotspots to review (not published here) | ${stats.hotspots ?? 'n/a'} |`,
        `| Left out by \`.github/sonar-issues-sync.json\` | ${stats.ignored} |`,
        ''
    ];
    const withFindings = plan.filter((r) => r.summary);
    if (withFindings.length > 0) {
        lines.push('### By rule', '', '| Rule | Quality | Severity | Findings | Issues |', '|---|---|---|---:|---|');
        for (const r of withFindings) {
            const name = rules.get(r.rule)?.name ? ` ${escapeMd(rules.get(r.rule).name)}` : '';
            const issueRefs =
                (refs.get(r.rule) || []).join(', ') +
                (r.pending.length ? `${refs.get(r.rule)?.length ? ', ' : ''}waiting` : '');
            lines.push(
                `| \`${r.rule}\`${name} | ${titleCase(r.summary.quality)} | ${titleCase(r.summary.severity)} | ${
                    r.summary.count
                } | ${issueRefs} |`
            );
        }
        lines.push('');
    } else {
        lines.push('No open findings to publish. :tada:', '');
    }
    lines.push(
        '---',
        '<sub>Generated by `.github/workflows/sonar-issues-sync.yml`. This issue is rewritten on every sync.</sub>'
    );
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTTP clients
// ---------------------------------------------------------------------------

async function request(url, options, what) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`${what}: HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

function sonarClient(baseUrl, token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return (path, params = {}) => {
        const url = new URL(path, `${baseUrl}/`);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
        return request(url, { headers }, `Sonar GET ${path}`);
    };
}

function githubClient(repo, token) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'kafnus-sonar-issues-sync'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return (method, path, body) =>
        request(
            `https://api.github.com/repos/${repo}${path}`,
            {
                method,
                headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
                body: body ? JSON.stringify(body) : undefined
            },
            `GitHub ${method} ${path}`
        );
}

async function fetchSonarIssues(sonar, projectKey) {
    const issues = [];
    for (let page = 1; ; page++) {
        const res = await sonar('api/issues/search', {
            components: projectKey,
            issueStatuses: 'OPEN,CONFIRMED',
            ps: 500,
            p: page
        });
        issues.push(...res.issues);
        const total = res.paging?.total ?? res.total ?? 0;
        if (issues.length >= total || res.issues.length === 0) {
            if (total > 10000)
                console.warn(`::warning::Sonar reports ${total} issues, only the first 10000 can be read`);
            return issues;
        }
        if (page * 500 >= 10000) return issues;
    }
}

async function fetchOpenSyncIssues(gh) {
    const out = [];
    for (let page = 1; ; page++) {
        const list = await gh('GET', `/issues?state=open&labels=${BASE_LABEL}&per_page=100&page=${page}`);
        out.push(...list.filter((i) => !i.pull_request));
        if (list.length < 100) return out;
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const dryRun = process.env.DRY_RUN !== 'false';
    const repo = process.env.GITHUB_REPOSITORY;
    const ghToken = process.env.GITHUB_TOKEN;
    if (!repo) throw new Error('GITHUB_REPOSITORY is required (owner/repo)');
    if (!dryRun && !ghToken) throw new Error('GITHUB_TOKEN is required when DRY_RUN=false');

    const cfg = loadConfig(readFileSync(CONFIG_PATH, 'utf8'));
    const props = parseProperties(readFileSync(SONAR_PROPERTIES_PATH, 'utf8'));
    const projectKey = props['sonar.projectKey'];
    const sonarUrl = (process.env.SONAR_HOST_URL || props['sonar.host.url'] || '').replace(/\/+$/, '');
    if (!projectKey || !sonarUrl) throw new Error('sonar.projectKey and a Sonar URL are required');

    const sonar = sonarClient(sonarUrl, process.env.SONAR_READ_TOKEN);
    const gh = githubClient(repo, ghToken);
    const previewDir = process.env.SYNC_PREVIEW_DIR;
    if (previewDir) mkdirSync(previewDir, { recursive: true });
    const log = [];
    const act = (msg) => {
        log.push(msg);
        console.log(`${dryRun ? '[dry-run] ' : ''}${msg}`);
    };

    console.log(`Reading SonarQube project ${projectKey} from ${sonarUrl}`);
    const sonarIssues = await fetchSonarIssues(sonar, projectKey);
    const analyses = await sonar('api/project_analyses/search', { project: projectKey, ps: 1 }).catch((e) => {
        console.warn(`::warning::Could not read the last analysis: ${e.message}`);
        return null;
    });
    const analysis = analyses?.analyses?.[0];
    const hotspots = await sonar('api/hotspots/search', { project: projectKey, status: 'TO_REVIEW', ps: 1 }).catch(
        (e) => {
            console.warn(`::warning::Could not read security hotspots: ${e.message}`);
            return null;
        }
    );

    const { published, security, ignored } = filterFindings(sonarIssues, cfg, projectKey);
    const groups = groupByRule(published);
    const rules = new Map();
    for (const ruleKey of groups.keys()) {
        const res = await sonar('api/rules/show', { key: ruleKey }).catch((e) => {
            console.warn(`::warning::Could not read rule ${ruleKey}: ${e.message}`);
            return null;
        });
        if (res?.rule) rules.set(ruleKey, res.rule);
    }

    const ctx = {
        repo,
        sonarUrl,
        projectKey,
        revision: analysis?.revision || process.env.GITHUB_SHA || 'main',
        analysisDate: analysis?.date?.slice(0, 10),
        maxOpenSubIssues: cfg.maxOpenSubIssues,
        maxRuleDescriptionChars: cfg.maxRuleDescriptionChars
    };
    const stats = {
        total: sonarIssues.length,
        security,
        ignored,
        hotspots: hotspots ? hotspots.paging?.total ?? null : null
    };
    console.log(
        `Sonar: ${stats.total} open issues, ${published.length} publishable in ${groups.size} rules, ` +
            `${security} security, ${ignored} ignored by config, analysis ${ctx.revision}`
    );

    const ghIssues = ghToken ? await fetchOpenSyncIssues(gh) : [];
    if (!ghToken) console.warn('No GITHUB_TOKEN: assuming there are no existing GitHub issues');
    const parsed = ghIssues.map(parseSyncIssue).filter(Boolean);
    let parent = parsed.find((i) => i.kind === 'parent');
    const existing = parsed.filter((i) => i.kind === 'rule');

    const openSonarKeys = new Set(sonarIssues.map((i) => i.key));
    const plan = computePlan({ groups, existing, openSonarKeys, cfg });

    // Labels
    const qualities = new Set(plan.flatMap((r) => r.creates.map(() => r.summary.quality)));
    const labels = [
        { name: BASE_LABEL, color: '4e9a06', description: 'Synced from SonarQube' },
        ...[...qualities].map((q) => ({
            name: `sonar:${q.toLowerCase()}`,
            color: QUALITY_LABEL_COLOR[q] || 'ededed',
            description: `SonarQube ${titleCase(q)} findings`
        }))
    ];
    for (const label of labels) {
        if (dryRun) continue;
        try {
            await gh('GET', `/labels/${encodeURIComponent(label.name)}`);
        } catch (e) {
            if (e.status !== 404) throw e;
            await gh('POST', '/labels', label);
            act(`Created label ${label.name}`);
        }
    }

    // Parent first, so new sub-issues can be linked to it
    if (!parent) {
        act(`Create parent issue "${PARENT_TITLE}"`);
        if (!dryRun) {
            const created = await gh('POST', '/issues', {
                title: PARENT_TITLE,
                body: `${PARENT_MARKER}\nSync in progress…`,
                labels: [BASE_LABEL]
            });
            parent = { number: created.number, id: created.id, body: created.body, title: created.title };
        }
    }

    const refs = new Map();
    const addRef = (rule, ref) => {
        if (!refs.has(rule)) refs.set(rule, []);
        refs.get(rule).push(ref);
    };
    const subIssueIds = [];
    let previewIndex = 0;
    const preview = (name, body) => {
        if (previewDir)
            writeFileSync(
                join(previewDir, `${String(++previewIndex).padStart(2, '0')}-${name.replace(/[^\w.-]+/g, '_')}.md`),
                body
            );
    };

    for (const r of plan) {
        const rule = rules.get(r.rule);
        for (const issue of r.kept) {
            act(`Keep #${issue.number} (${r.rule}) untouched: it is assigned`);
            addRef(r.rule, `#${issue.number} (assigned)`);
            subIssueIds.push(issue.id);
        }
        for (const { issue, findings, part } of r.updates) {
            const title = renderTitle(r.rule, rule, part);
            const body = renderSubIssueBody({ ruleKey: r.rule, rule, findings, ctx });
            preview(r.rule, body);
            addRef(r.rule, `#${issue.number}`);
            subIssueIds.push(issue.id);
            if (issue.title === title && issue.body.replace(/\r\n/g, '\n') === body) continue;
            act(`Update #${issue.number} (${r.rule}, ${findings.length} findings)`);
            if (!dryRun) await gh('PATCH', `/issues/${issue.number}`, { title, body });
        }
        for (const { findings, part } of r.creates) {
            const title = renderTitle(r.rule, rule, part);
            const body = renderSubIssueBody({ ruleKey: r.rule, rule, findings, ctx });
            preview(r.rule, body);
            act(`Create "${title}" (${findings.length} findings)`);
            if (dryRun) {
                addRef(r.rule, 'new');
                continue;
            }
            const created = await gh('POST', '/issues', {
                title,
                body,
                labels: [BASE_LABEL, `sonar:${r.summary.quality.toLowerCase()}`]
            });
            addRef(r.rule, `#${created.number}`);
            subIssueIds.push(created.id);
        }
        for (const p of r.pending)
            act(`Waiting: ${r.rule} (${p.findings.length} findings), open sub-issue limit reached`);
        for (const issue of r.closes) {
            act(`Close #${issue.number} (${r.rule}): SonarQube no longer reports its findings`);
            if (dryRun) continue;
            await gh('POST', `/issues/${issue.number}/comments`, {
                body: 'SonarQube no longer reports any open finding assigned to this issue, closing it.'
            });
            await gh('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
        }
    }

    // Link sub-issues to the parent (best effort: sub-issues may be disabled)
    if (!dryRun && parent) {
        try {
            const linked = new Set();
            for (let page = 1; ; page++) {
                const list = await gh('GET', `/issues/${parent.number}/sub_issues?per_page=100&page=${page}`);
                list.forEach((i) => linked.add(i.id));
                if (list.length < 100) break;
            }
            for (const id of subIssueIds) {
                if (linked.has(id)) continue;
                await gh('POST', `/issues/${parent.number}/sub_issues`, { sub_issue_id: id, replace_parent: true });
                act(`Linked issue id ${id} as sub-issue of #${parent.number}`);
            }
        } catch (e) {
            console.warn(`::warning::Could not link sub-issues (the parent table still lists them): ${e.message}`);
        }
    }

    const parentBody = renderParentBody({ plan, stats, rules, ctx, refs });
    preview('parent', parentBody);
    if (parent && parent.body?.replace(/\r\n/g, '\n') !== parentBody) {
        act(`Update parent issue #${parent.number}`);
        if (!dryRun) await gh('PATCH', `/issues/${parent.number}`, { body: parentBody });
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
        const summary = [
            `## SonarQube → GitHub issues sync${dryRun ? ' (dry run)' : ''}`,
            '',
            ...(log.length ? log.map((l) => `- ${l}`) : ['- Nothing to do']),
            '',
            '<details><summary>Parent issue body</summary>',
            '',
            parentBody,
            '',
            '</details>',
            ''
        ];
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
    }
    console.log(`Done${dryRun ? ' (dry run, nothing was written to GitHub)' : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => {
        console.error(`::error::${e.message}`);
        process.exit(1);
    });
}
