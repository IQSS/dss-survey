# The survey's command surface. The page publishes itself from CI on every push to main; the receiver
# (apps-script/) is deployed from here, because only the maintainer's Google login can deploy it.

# The receiver's deployment: its ID is the web-app address in surveys/<year>.yml, so updating this one
# deployment keeps the address the page posts to.
deployment := "AKfycbxiOhMQ71eu6hIfHcC5cVQHvexdoMuqfLyOzqNETC7YJBLpxZy3nLkGeoO0Kr7VsfQU"
endpoint := "https://script.google.com/macros/s/" + deployment + "/exec"

default:
    @just --list

# Render the page into _site.
render:
    quarto render

# Preview the page locally, re-rendering on save.
preview:
    quarto preview

# Push the receiver's code and move its deployment to the new version (same address).
deploy-receiver:
    cd apps-script && clasp push -f && clasp redeploy {{deployment}} --description "survey receiver"

# Print a year's responses as CSV (`just responses 2026 > somewhere-private.csv`); with no year, list the tabs.
# The key comes from 1Password and goes in the request body, never the address. The CSV holds respondents'
# emails, so write it somewhere outside this public repository.
responses tab="":
    #!/usr/bin/env zsh
    set -euo pipefail
    key=$(op read op://Credentials/dss-survey-export-key/credential)
    jq -n --arg k "$key" --arg t "{{tab}}" '{action: "export", key: $k} + (if $t == "" then {} else {tab: $t} end)' |
      curl -sSL -H 'Content-Type: text/plain' --data @- "{{endpoint}}"

# Confirm the receiver answers. A test row is written to the tab named `test`; delete it from the Sheet after.
check-receiver:
    curl -sSL "{{endpoint}}"; echo
    curl -sSL -H 'Content-Type: text/plain' --data '{"survey":"test","answers":{"role":"test"},"seconds":0}' "{{endpoint}}"; echo
