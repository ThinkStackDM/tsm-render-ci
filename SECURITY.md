# Security & guardrails

This repository is **public**. Treat everything in it as world-readable, forever.

## Hard rules
1. **No secrets, ever.** No API keys, tokens, private keys, wallet addresses, OAuth client
   secrets, or `.env` files. The only credential workflows may use is the auto-provided
   `${{ secrets.GITHUB_TOKEN }}`. Any other secret must be a repo/org **Actions secret**
   referenced as `${{ secrets.NAME }}` — never a committed value.
2. **No content.** Narration scripts, generated assets, and finished videos are **inputs and
   outputs**, not repo contents. Scripts arrive via workflow inputs; media leaves via Actions
   artifacts. `.gitignore` blocks `_render_out/`, `assets/`, `work-products/`, and media files.
3. **No infrastructure identifiers.** No Oracle OCIDs (tenancy/compartment/subnet/image),
   no self-hosted runner registration tokens, no host paths that reveal account structure.
   That material stays in the private `thinkstack-media-render` repo.
4. **No untrusted execution.** Do not enable `pull_request_target`; do not auto-run workflows
   from fork PRs. Secrets are not exposed to fork PRs by default — keep it that way.

## Before pushing
Run a quick scan for accidental leaks:
```
git grep -inE "ocid1\.|BEGIN [A-Z ]*PRIVATE KEY|gh[ps]_[A-Za-z0-9]{10}|KRAKEN|sk-[A-Za-z0-9]{20}"
```
It should return nothing but `${{ secrets.* }}` references.

## If a secret is ever committed
Rotate it immediately (the value is compromised the moment it lands in public history),
then scrub history with `git filter-repo` / BFG and force-push. Rotation first, scrub second.
