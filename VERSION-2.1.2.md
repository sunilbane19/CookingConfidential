# Cooking Confidential — Version 2.1.2 DOCX Import Regression Fix

**Status:** Closed — deployed to Live and verified by the user  
**Date:** 29 October 2026  
**Live site:** https://cookingconfidential.in/  
**Repository:** https://github.com/sunilbane19/CookingConfidential  
**Deployment:** [GitHub Actions run #861](https://github.com/sunilbane19/CookingConfidential/actions/runs/40839783174)  
**Final commit:** `c1cfb8549d02ccd02700f13fa1ef02cae98814b9`  
**Deployment result:** Success

## Scope

Targeted fix for a DOCX parsing regression. No broad Staging-to-Live merge was performed.

### 1. Correct inline section-label matching

- Corrected the inline section-label regular expression in `docx-parser.js`. Incorrect escaping prevented labels such as `Ingredients:`, `Method:`, and `Notes:` from matching as intended.
- Updated the DOCX parser cache version to `1.0.20`.
- Refreshed the dependent import review and import inbox module references so Live loads the corrected parser.

### 2. Regression verification

The user confirmed these recipes are working on Live after the fix:

- **Mooli Parathas** — previously regressed into Rescue Editor; now fixed.
- **Manjiri Kolhapur Mutton Masala** — extraction working.
- **Sabudana Wada** — extraction working; Method and Notes content separation checked.

The user also reported that other DOCX recipes tested remained fine.

## Release and change control

- Version 2.1.2 is the next targeted Live patch following Version 2.1.1.
- Version 2.1.1's separate DOCX parsing issue is closed by this release.
- No broad Staging-to-Live merge was performed.
- Deployment run #861 completed successfully and the user confirmed the regression fix on Live.
