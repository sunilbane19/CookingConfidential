# Cooking Confidential — Staging changes to review before Live

Purpose: running checklist of changes made and tested on Staging that should be reviewed before deciding what to carry into Live. This is a porting checklist, not an instruction to merge everything automatically.

## Confirmed and tested

### Upload screen
- [x] **Unsupported image file message:** when an image file is selected, Staging displays a clear message that image files are not catered for in this upload workflow and advises using PDF, DOCX or TXT. Image files are not added to the upload queue; supported files selected alongside them can still be queued.
- [x] **Remove Recipe URL field:** removed the Recipe URL field and Add URL control from the upload screen, and removed the corresponding Add URL event handler.

## Confirmed and tested — additional Staging changes (14 October 2026)

### Multi-recipe import
- [x] **Multi-recipe DOCX separation:** split document content into recipe blocks and pass each block through the existing single-recipe `parseDocx` parser; if splitting is unreliable, fall back to parsing the full document.
- [x] **Regression test:** user confirmed the Chutney (5 recipes), Khichdi (6 recipes), and Fish curries (4 recipes) multi-recipe DOCX documents all worked.
- [x] **Single-recipe DOCX regression:** user confirmed an ordinary single-recipe DOCX still worked.
- [x] **Multi-recipe image path:** use local Tesseract OCR rather than calling the chargeable Vision model first.
- [x] **Dietary / suitability multi-select:** corrected nested label markup and then gave each checkbox an explicit unique ID and associated label; user confirmed the selector now behaves correctly when toggling an item off.

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


## Pending — consistent confirmation and error dialogs (14 October 2026)

- [ ] **Replace browser-native confirmation and error messages throughout Cooking Confidential** (including admin actions such as sending a sign-in link) with the established branded modal/window style already used in the app.
- [ ] Use a consistent visual treatment for success/confirmation, warning, and error states; clear message text and appropriately labelled actions. Avoid native browser `alert()`, `confirm()`, and `prompt()` dialogs wherever an app-styled equivalent is appropriate.
- [ ] Preserve each action's existing behaviour and safety: destructive or consequential actions still require confirmation; success messages appear only after the operation succeeds; errors explain what failed without hiding useful details.
- [ ] Check keyboard and accessibility behaviour (focus placement/return, keyboard activation, Escape where appropriate, and clear button labels) and ensure dialogs work on desktop and mobile.
- [ ] Regression-test admin user management (send sign-in link, activate/deactivate), recipe add/edit/save, upload/import, and other flows that currently show confirmation or error messages. Confirm there are no unexpected native browser dialogs.
- [ ] Deploy to Staging and obtain user confirmation before marking this item tested or considering it for Live.

Status: **Requested; not implemented or tested yet.** The screenshot from 14 October 2026 shows the browser-native “Sign-in link sent to sunetrabane@gmail.com” alert, which should be replaced by the app's established styled message window.
