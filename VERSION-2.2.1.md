# Cooking Confidential — Version 2.2.1

**Status:** Frozen — deployed to Live and verified by the user  
**Date:** 13 November 2026  
**Live site:** https://cookingconfidential.in/  
**Repository:** https://github.com/sunilbane19/CookingConfidential  
**Deployment:** [GitHub Actions run #878](https://github.com/sunilbane19/CookingConfidential/actions/runs/43154352552)  
**Production code commit:** `a73dfe1f29d1b24b856ec9622dd25b763f4546d8`  
**Deployment result:** Success

## Release scope

Version 2.2.1 is a targeted DOCX multi-recipe extraction correction promoted from Staging after user testing. It is the next patch release following Version 2.2.0.

### 1. Multi-recipe DOCX recipe boundaries

- Corrected DOCX multi-recipe heading detection so Ingredients and Method section headings are recognised reliably.
- Prevented the next recipe's title and section headings from leaking into the preceding recipe's Method.
- Preserved each recipe as a separate extraction/review record.

### 2. Explicit Description section handling

- Recognised an explicit `Description` heading as the start of the Description section.
- Routed the text following that heading into the recipe's Description field.
- Prevented description text that repeats the recipe title from being treated as another recipe title.
- Preserved the source description text, including when it duplicates the recipe name.

### 3. Parser and module loading

- Updated the shared `docx-parser.js` and dependent single-/multi-recipe import module references.
- Refreshed browser cache versions for the affected import modules.
- Kept the correction targeted; unrelated Live-only changes were preserved.

## Verification and sign-off

- The user tested the Sauce Recipes multi-recipe DOCX on Staging and confirmed the correction worked.
- The user authorised promotion from Staging to Live.
- The Live deployment completed successfully in GitHub Actions run #878.
- The user subsequently confirmed that the Live version is working fine.

## Freeze and change control

- Freeze Version 2.2.1 as the current Live baseline.
- No further changes are authorised on Live as part of this release.
- All subsequent development and fixes must be made on Staging first, tested, and promoted only after explicit approval.
- Use Version 2.2.2 onward for the next targeted patch, if required.
