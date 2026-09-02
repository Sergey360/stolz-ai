import { installProfile } from './profile-installer.mjs';
import { resolveProfile } from './profile-resolver.mjs';

function parse(argv) {
  const result = { requested_integrations: [], capabilities: { command_execution: true } };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === 'resolve' || argument === 'install') result.command = argument;
    else if (argument === '--runtime') result.runtime = argv[++index];
    else if (argument === '--provider') result.provider = argv[++index];
    else if (argument === '--integration') result.requested_integrations.push(argv[++index]);
    else if (argument === '--destination') result.destination = argv[++index];
    else if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--deny-adapter') result.capabilities.command_execution = false;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return result;
}

try {
  const options = parse(process.argv.slice(2));
  if (!options.command) throw new Error('usage: profile-cli.mjs <resolve|install> [--runtime codex] [--provider overlay-id] [--integration id] [--destination absolute-path] [--dry-run]');
  const resolution = await resolveProfile(options);
  if (options.command === 'resolve') process.stdout.write(`${JSON.stringify(resolution)}\n`);
  else {
    if (!options.destination) throw new Error('install requires --destination');
    process.stdout.write(`${JSON.stringify({ resolution, install: await installProfile(resolution, options) })}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
