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

# Confirm the receiver answers. A test row is written to the tab named `test`; delete it from the Sheet after.
check-receiver:
    curl -sSL "{{endpoint}}"; echo
    curl -sSL -H 'Content-Type: text/plain' --data '{"survey":"test","answers":{"role":"test"},"seconds":0}' "{{endpoint}}"; echo
