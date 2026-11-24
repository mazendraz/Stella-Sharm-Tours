/**
 * Safe summary of a failed gitleaks run for CI logs (this repository's logs
 * are public). Prints only the rule, file and line of each finding, plus
 * gitleaks errors. Never the matched text, commit content or author.
 */
export function printScanSummary(output) {
  const text = output.replace(/\x1b\[[0-9;]*m/g, '');
  const findings = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('Finding:')) {
      current = {};
      findings.push(current);
      continue;
    }
    const field = /^(RuleID|File|Line|Commit):\s+(.*)$/.exec(line);
    if (field && current) current[field[1]] = field[2].trim();
    if (/\b(ERR|FTL)\b/.test(line)) console.error('gitleaks: ' + line);
  }
  for (const f of findings)
    console.error(
      `finding: ${f.RuleID ?? '?'} in ${f.File ?? '?'}:${f.Line ?? '?'}` +
        (f.Commit ? ` (commit ${f.Commit.slice(0, 12)})` : ''),
    );
}
