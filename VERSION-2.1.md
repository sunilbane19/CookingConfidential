# Cooking Confidential — Version 2.1

**Status:** Migration closed; Live baseline frozen  
**Date:** 27 October 2026  
**Live site:** https://cookingconfidential.in/  
**Repository:** https://github.com/sunilbane19/CookingConfidential  
**Production code commit:** `23be2cef99f065dc5bc8bd6fe7cc1ab9421c0341`  
**Production deployment:** https://github.com/sunilbane19/CookingConfidential/actions/runs/40444705557  
**Deployment result:** Success

## Release decision

Version 2.1 records the six approved Staging-to-Live migration groups as integrated and confirmed by the user. The migration is closed. This is a documentation and release-baseline record; it does not introduce application-code changes.

## Six approved groups

1. Dietary/suitability options and display in recipe details.
2. Library filters/search, full recipe-link dropdown, Unlink, and related link behaviour.
3. Save navigation back to the originating library tab.
4. Document import/extraction: PDF, DOCX, TXT, and legacy DOC via Docstream.
5. Multi-recipe import and review workflow.
6. Rescue Editor recovery workflow, including editable proposed fields and handoff/recovery behaviour.

## Verification recorded

- Groups 1 and 2 were tested on Live and confirmed working.
- Groups 4 and 5 were tested on Live and confirmed working.
- Group 6 had previously been confirmed by the user.
- The Stage 3 legacy Word issue was investigated using production diagnostics. Docstream extracted the file text, but the parser failed for legacy DOC files without an explicit Method heading. The parser was corrected to infer a conservative boundary for that case.
- The user subsequently retested all document types and both single-recipe and multi-recipe imports on Live and confirmed they were working.

## Deployment history relevant to the DOC fix

- PR #47: restore Staging Docstream routing/parser behaviour.
- PR #48: resolve original file path fallback for legacy DOC.
- PR #49: fix title-quality helper scope in the legacy DOC parser.
- PR #50: restore Staging's Docstream extracted-text handoff/retry flow.
- PR #51: infer a missing method boundary for legacy DOC recipes such as Chicken Xacuti.

The final production deployment for PR #51 completed successfully. The production code commit above is the resulting Live baseline.

## Freeze and change control

- Treat Version 2.1 as the current Live baseline.
- Do not make further changes to these six groups unless the user explicitly authorizes new work or a regression needs correction.
- Keep Staging unchanged unless a specific Staging change is authorized.
- For future releases, branch from the current Live baseline, make isolated changes, regression-test on Staging, and migrate only the approved scope.
- Do not merge broad feature branches wholesale into Live.
- Do not restart the disabled hourly “CC PDF Test Readiness” automation unless explicitly requested.

## Outstanding items

No outstanding implementation work remains for the six approved migration groups based on the user's confirmations. Previously parked items outside these six groups remain separate and are not part of Version 2.1.
