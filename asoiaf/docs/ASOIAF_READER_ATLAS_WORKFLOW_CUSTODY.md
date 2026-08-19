# ASOIAF reader-atlas workflow custody

The controlling deployment workflow is `.github/workflows/asoiaf-reader-atlas-pages-v3.yml`. It qualifies the static artifact, enables GitHub Pages when necessary, records an artifact checksum ledger, and deploys `docs/asoiaf` as the site root.

The controlling rendered-endpoint gate is `.github/workflows/asoiaf-reader-atlas-live-canary-v3.yml`. It verifies the title, question-builder control surface, public authority boundary, seven evidence lanes, eleven released-future witnesses, v4.1 fail-closed hold, and continuation manifest standing against the live endpoint.

Earlier reader deployment and canary revisions were construction iterations. They were removed after v3 corrected the static inventory gate and became the qualified successor. Their workflow-run histories remain provenance only and carry no continuing deployment authority.
