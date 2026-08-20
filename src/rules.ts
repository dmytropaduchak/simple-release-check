export type Severity = "high" | "medium" | "low";
export type Finding = {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  file: string;
};

export function scanReleaseHygiene(rootFiles: Set<string>, workflowTexts: Array<{ file: string; content: string }>): Finding[] {
  const findings: Finding[] = [];

  const hasChangelog = [...rootFiles].some((f) => /(^|\/)CHANGELOG(\.md)?$/i.test(f) || /(^|\/)CHANGES(\.md)?$/i.test(f));
  if (!hasChangelog) {
    findings.push({
      ruleId: "missing-changelog",
      severity: "medium",
      title: "No CHANGELOG.md (or CHANGES.md)",
      detail: "Keep a changelog so release consumers know what changed.",
      file: "CHANGELOG.md",
    });
  }

  const releaseWorkflows = workflowTexts.filter(
    (w) => /release/i.test(w.file) || /on:\s*[\s\S]*release/i.test(w.content) || /tags:\s*\[/i.test(w.content),
  );

  if (!releaseWorkflows.length) {
    findings.push({
      ruleId: "no-release-workflow",
      severity: "low",
      title: "No obvious release workflow",
      detail: "Consider a workflow triggered on release/tags for automation.",
      file: ".github/workflows",
    });
  }

  const allWf = workflowTexts.map((w) => w.content).join("\n");
  if (!/sbom|cyclonedx|spdx/i.test(allWf)) {
    findings.push({
      ruleId: "missing-sbom",
      severity: "medium",
      title: "No SBOM step detected in workflows",
      detail: "Generate CycloneDX/SPDX on release for supply-chain transparency.",
      file: ".github/workflows",
    });
  }
  if (!/provenance|attest-build-provenance|actions\/attest/i.test(allWf)) {
    findings.push({
      ruleId: "missing-provenance",
      severity: "medium",
      title: "No provenance / attestation step detected",
      detail: "Attach build provenance (e.g. actions/attest-build-provenance) on release artifacts.",
      file: ".github/workflows",
    });
  }

  return findings;
}
