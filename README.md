# DSS training survey

A short survey from IQSS Data Science Services asking researchers at Harvard and MIT which training topics
and formats they would use. It is published at <https://iqss.github.io/dss-survey/>.

## How it works

- **The questions** for each year are in `surveys/<year>.yml`, and `index.qmd` names the current year's file.
  `survey.lua`, a Quarto filter, turns that file into the form when the page renders. The look comes from the
  [DSS theme](https://github.com/IQSS/dss-theme).
- **The responses** are sent by `assets/survey.js` to a Google Apps Script web app, whose code is in
  `apps-script/`. It runs on the maintainer's Harvard Google account and adds each response as a row to a
  Google Sheet in that account, with one tab for each year. Nothing a respondent enters is stored in this
  repository or on GitHub.
- **Publishing:** every push to `main` renders the page and publishes it to GitHub Pages.

## A new year's survey

1. Copy `surveys/2026.yml` to `surveys/2027.yml`, change `id`, and edit the questions. Keep a question's
   `id` the same from year to year if it asks the same thing, so its answers stay comparable.
2. Point `metadata-files` in `index.qmd` at the new file.
3. Push. The receiver needs no change: the new `id` becomes a new tab in the same Sheet.

## The receiver

Deployed with [clasp](https://github.com/google/clasp), Google's command-line tool for Apps Script, logged in
as the maintainer. After changing `apps-script/Code.js`, run `just deploy-receiver`; it keeps the same web
address, so the page needs no change. `just check-receiver` sends a test response to a tab named `test`.

## Reading the responses

Open the Sheet in the maintainer's Google Drive, or from the command line run `just responses 2026` to print
that year's tab as CSV (`just responses` alone lists the tabs). The command reads a private key from the
maintainer's 1Password; without it the receiver returns nothing. The CSV includes respondents' email
addresses, so save it outside this repository.

## License

The code is under the [MIT License](LICENSE).
