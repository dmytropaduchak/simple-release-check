import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { scanReleaseHygiene, type Finding } from "./rules";

const MARKER = "<!-- simple-release-check -->";
const NAME = "Simple Release Check";

function walk(root: string): string[] {
  const out: string[] = [];
  function rec(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) rec(full);
      else out.push(path.relative(root, full));
    }
  }
  rec(root);
  return out;
}

function formatFindings(findings: Finding[]): string {
  if (!findings.length) {
    return [MARKER, `## ${NAME}`, "", "Release hygiene checks look OK."].join("\n");
  }
  const rows = findings.map((f) => `| ${f.severity} | \`${f.ruleId}\` | ${f.file} | ${f.title} |`).join("\n");
  return [
    MARKER,
    `## ${NAME}`,
    "",
    `Found **${findings.length}** issue(s).`,
    "",
    "| Severity | Rule | Location | Detail |",
    "| --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

async function upsertPrComment(token: string, body: string): Promise<void> {
  const { context } = github;
  if (context.eventName !== "pull_request" && context.eventName !== "pull_request_target") return;
  const issue_number = context.payload.pull_request?.number;
  if (!issue_number) return;
  const octokit = github.getOctokit(token);
  const { data: comments } = await octokit.rest.issues.listComments({ ...context.repo, issue_number });
  const existing = comments.find((c) => c.body?.includes(MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
    return;
  }
  await octokit.rest.issues.createComment({ ...context.repo, issue_number, body });
}

async function run(): Promise<void> {
  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
  const failOn = (core.getInput("fail-on") || "none").toLowerCase();
  const files = walk(process.cwd());
  const wfDir = ".github/workflows";
  const workflowTexts: Array<{ file: string; content: string }> = [];
  if (fs.existsSync(wfDir)) {
    for (const name of fs.readdirSync(wfDir)) {
      if (!/\.ya?ml$/i.test(name)) continue;
      const file = path.join(wfDir, name);
      workflowTexts.push({ file, content: fs.readFileSync(file, "utf8") });
    }
  }
  const findings = scanReleaseHygiene(new Set(files), workflowTexts);
  const summary = formatFindings(findings);
  await core.summary.addRaw(summary, true).write();
  for (const f of findings) {
    if (f.severity === "high") core.error(`${f.title} (${f.ruleId})`);
    else if (f.severity === "medium") core.warning(`${f.title} (${f.ruleId})`);
    else core.notice(`${f.title} (${f.ruleId})`);
  }
  if (token) {
    try {
      await upsertPrComment(token, summary);
    } catch (e) {
      core.warning(`Could not post PR comment: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  core.setOutput("finding-count", String(findings.length));
  const shouldFail =
    failOn === "high"
      ? findings.some((f) => f.severity === "high")
      : failOn === "medium"
        ? findings.some((f) => f.severity === "high" || f.severity === "medium")
        : false;
  if (shouldFail) core.setFailed(`simple-release-check: ${findings.length} finding(s)`);
  else core.info(`Done. ${findings.length} finding(s).`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
