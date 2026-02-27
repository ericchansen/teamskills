# Kobayashi — History

## Project Context
- **Project:** Team Skills Tracker — Auth via Microsoft Entra ID
- **User:** Eric Hansen
- **Frontend auth:** `@azure/msal-browser` + `@azure/msal-react`, loginRedirect flow
- **Backend auth:** JWT bearer validation via `jwks-rsa`, optional (demo mode)
- **Config:** `frontend/src/authConfig.js`, `frontend/src/config.js` (runtime injection)
- **CI/CD secrets:** GitHub Environment "production" with individual secrets in JSON format
- **Staging:** Uses `environment: staging` (not production)
- **Dependabot:** Can't access GitHub Actions/Environment secrets — only Dependabot secrets

## Learnings
