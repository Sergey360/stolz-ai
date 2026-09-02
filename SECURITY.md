# Security Policy

## Supported versions

Before the first tagged public release, security fixes are made against the
current default development branch. A release support matrix will be added with
the first public version.

## Reporting a vulnerability

Do not include exploit details, credentials, private task material, or a
proof-of-concept that could harm users in a public issue. Report the finding
privately to the repository maintainers through the hosting platform's private
security-reporting channel, or use the maintainer contact published with the
first public release.

Include the affected revision, reproduction conditions, impact, and any safe
mitigation known to you. Maintainers will acknowledge receipt, assess the
report, and coordinate a fix and disclosure timeline when a contact channel is
available.

## Security boundaries

STOLZ A.I. stores no provider credential in skills, manifests, fixtures, or
public reports. Adapters expose explicit capabilities; command execution uses
program-and-argument vectors rather than shell strings. Artifact identities,
verification results, and invalidation rules are required before reuse.

Do not publish private operational details or secrets obtained from a provider
runtime. See [docs/SOLUTION_DESIGN.md](docs/SOLUTION_DESIGN.md) for the
architecture's provenance and release-security controls.
