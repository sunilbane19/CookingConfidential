# Cooking Confidential — Version 2.1.1 Targeted Live Patch

**Status:** Closed — deployed and verified by the user; follow-up DOCX parser regression resolved in Version 2.1.2  
**Date:** 28 October 2026  
**Live site:** https://cookingconfidential.in/  
**Repository:** https://github.com/sunilbane19/CookingConfidential  
**Deployment:** [GitHub Actions run #843](https://github.com/sunilbane19/CookingConfidential/actions/runs/40656552310)  
**Final commit:** `a268785a31434484f6cfac595bd6228aee60b449`  
**Deployment result:** Success

## Scope

This was a deliberately targeted promotion from Staging. No broad Staging-to-Live merge was performed.

### 1. Save a reviewed import and return to the Import list

- Removed the forced page reload after saving a reviewed recipe.
- Saving no longer throws the user back to the recipe-card list; the Import dialog remains available.
- Refreshed the import review module cache reference so Live loads the updated code.

### 2. Align Dietary / suitability in the Import editor

- Applied the Staging-tested vertical alignment adjustment to the Dietary / suitability control in the Import editor.
- Scoped the selector to the Import editor so the regular recipe Edit editor is not intentionally affected.
- Refreshed the stylesheet cache reference.

## Verification and sign-off

- The user tested both changes on Live on 28 October 2026 and confirmed that both work as expected.
- GitHub Actions deployment run #843 completed successfully.
- This targeted promotion is closed.

## Change control

- Keep the Version 2.1 production baseline and the prior six-group migration record intact.
- Record this as a small post-baseline patch, not a wholesale Staging promotion.
- Any further Import editor or navigation change requires a separate, explicit scope and test.

## Separate issue noted — Manjiri Kolhapur Mutton Masala DOCX

The user reported that this DOCX entered Rescue Editor even though it contains a title, Description, Ingredients, and Method sections. The extracted text is readable, but some ingredient lines appear concatenated in the Rescue Editor view.

**Status: Closed in Version 2.1.2.** The inline section-label matching expression was corrected and deployed. The user confirmed Mooli Parathas, Manjiri Kolhapur Mutton Masala, and Sabudana Wada now work on Live. See [Version 2.1.2](VERSION-2.1.2.md).
