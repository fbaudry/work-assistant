import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function releaseVersion(run, attempt) {
  if (!/^[1-9]\d*$/.test(run ?? '') || !/^[1-9]\d*$/.test(attempt ?? '')) throw new Error('GitHub run number and attempt must be positive integers.');
  return `0.1.0-alpha.${run}.${attempt}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = releaseVersion(process.env.GITHUB_RUN_NUMBER, process.env.GITHUB_RUN_ATTEMPT);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  pkg.version = version;
  pkg.distribution = 'alpha';
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  console.log(version);
}
