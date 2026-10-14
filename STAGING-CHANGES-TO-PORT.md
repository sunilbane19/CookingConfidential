# Cooking Confidential — Staging changes to review before Live

Purpose: running checklist of changes made and tested on Staging that should be reviewed before deciding what to carry into Live. This is a porting checklist, not an instruction to merge everything automatically.

## Confirmed and tested

### Upload screen
- [x] **Unsupported image file message:** when an image file is selected, Staging displays a clear message that image files are not catered for in this upload workflow and advises using PDF, DOCX or TXT. Image files are not added to the upload queue; supported files selected alongside them can still be queued.
- [x] **Remove Recipe URL field:** removed the Recipe URL field and Add URL control from the upload screen, and removed the corresponding Add URL event handler.

## Before carrying these changes to Live
- [ ] Review the relevant code diff against the Live version before porting.
- [ ] Confirm the intended Live upload workflow should not accept image files or recipe URLs.
- [ ] Regression-test PDF, DOCX and TXT uploads, including selecting supported and unsupported files together.
- [ ] Confirm the URL field is absent and no remaining code expects the removed upload-screen controls.
- [ ] Deploy to Live only after the overall Staging-to-Live release is approved.

## Release notes
- Staging development branch: `rescue-ocr-fallback-test`
- Staging site: https://sunilbane19.github.io/CookingConfidential-staging/
- These changes were confirmed tested by the user on 14 October 2026.
- This checklist does not certify that other Staging-only changes have been reviewed or are ready for Live.

### Multi-recipe DOCX parser reuse — awaiting regression test
- [ ] Multi-recipe DOCX import now separates document blocks and passes each candidate to the existing single-recipe `parseDocx` routine; if separation is not reliable, it falls back to that same parser on the whole document.
- [ ] Regression-test the three working multi-recipe documents (chutneys, khichdis and fish curries) and verify recipe counts, titles, ingredients and methods.
- [ ] Confirm single-recipe DOCX remains unchanged; no single-recipe DOCX parser or PDF parser code was modified.
- [ ] Confirm multi-image extraction uses the local Tesseract path rather than a paid vision-first call; no OCR/model calls have been run as part of this code change.
