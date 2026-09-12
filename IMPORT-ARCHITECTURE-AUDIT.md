# Cooking Confidential — Import Architecture Audit

## Stable baseline

The tested V1.2 UI/OCR/extraction baseline is commit `786fd7a`. Phase B changes are intended to preserve that behaviour while removing obsolete input-specific routing.

## Generalized import architecture

The import pipeline is designed around the properties of the source rather than recipe names:

- **PDF:** use text extraction where readable; use browser OCR for scanned PDFs.
- **Image:** OCR with layout/row reconstruction and recipe-boundary detection.
- **DOCX:** extract document structure/text and detect recipe sections.
- **TXT/MD/CSV:** treat as text input and apply generic recipe heuristics.
- **URL:** fetch the page, prefer Schema.org Recipe JSON-LD, then use cleaned HTML/text heuristics as fallback.
- **One or many recipes:** detect recipe count from document structure/OCR rather than assuming a fixed number.
- **Review:** route a single detected recipe to single-recipe review and multiple detected recipes to multi-recipe review.

## Phase B cleanup

Removed obsolete code that contained test-input-specific behaviour:

- Removed the old general import router that explicitly special-cased “rubs”.
- Removed the old extraction fallback that explicitly parsed Karivepaku Podi.
- Removed the explicit “swadish” title cleanup and named recipe-word fallback from single-recipe review.
- Replaced the scanned-PDF review trigger with generic suspicious-title / weak-ingredient checks.
- Removed the deleted fallback module from the import extras loaded by `index.html`.

## What counts as acceptable heuristic logic

Generic vocabularies such as `ingredients`, `method`, common measurement units, common cooking verbs, social-media UI labels, and recipe classification terms are acceptable because they describe document structure or the recipe domain. They must not depend on a particular recipe, filename, creator, website, or test document.

## Remaining test gates

Before declaring the importer generalized, test at least:

1. One recipe in a text PDF.
2. One recipe in a scanned PDF.
3. Multiple recipes in a PDF.
4. Image containing one recipe.
5. Image containing multiple recipes.
6. DOCX containing one recipe.
7. DOCX containing multiple recipes.
8. URL with Recipe JSON-LD.
9. URL without Recipe JSON-LD.
10. Multiple files in one import queue.

A true folder-selection workflow remains a separate implementation item; selecting multiple individual files is not considered equivalent to selecting an entire folder.
