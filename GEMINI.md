# Awards Nomination Mailer: Gemini Mandates

This document outlines the core architecture and operational rules for the Awards Nomination Mailer project.

## Project Architecture
The application is a Node.js-based mailer system that processes nomination data from an Excel file (`nomination_data_2026-02-18 (1).xlsx`).

### Award Normalization Logic
`server.js` uses a keyword-based normalization (`normalize`) to map inconsistent award names from the Excel sheet to canonical award categories:
1.  **Normalization:** Lowercases and removes non-alphabetic characters.
2.  **Mapping:** Uses `scrutinyMappings` in `server.js` to find the correct faculty representative.
3.  **Form Mapping:** Matches the canonical award to a filename in `award_form_mapping.json`.

### Key Data Files
-   `scrutinity_members.json`: Maps award categories to faculty members.
-   `supporting_documents.json`: Maps award categories to required documents.
-   `award_form_mapping.json`: Maps award categories to `.docx` nomination forms.

## Engineering Rules
-   **Mandatory Normalization:** Always use the `normalize()` function when comparing award names.
-   **Email Template:** `mail_template.html` is the definitive template. Placeholders are:
    -   `{{name}}`, `{{award}}`, `{{docsList}}`, `{{scrutinyList}}`, `{{downloadLink}}`, `{{deadline}}`.
-   **Static Route:** Any file in the `awards-form/` directory must be served via the `/forms` route.

## Deployment Mandates
-   The backend must support static file serving for both `index.html` (the dashboard) and the nomination forms.
-   Vercel deployment requires the server to be exported as a module (`module.exports = app`) and use the `@vercel/node` builder.
