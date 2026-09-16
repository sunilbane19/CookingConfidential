# Cooking Confidential V1.2.15

Import review stability and DOCX parsing checkpoint.

- Added a dedicated DOCX multi-recipe review path.
- DOCX parsing now detects recipe headings and ingredient rows without requiring an Ingredients heading.
- Preserves process/method text and shared-base references.
- Added safe source-post review routing so extraction failures close the dialog instead of leaving the page apparently frozen.
- Authentication is unchanged.

The supplied Focassia Baking Apr 2026 DOCX contains two actual recipe headings: Focassia and Hard Roll. Hard Roll refers to Soft Roll, but the Soft Roll text is not present in this file, so inheritance cannot invent the missing base recipe.

Test the supplied DOCX first, then retest the previously failing source-post import. Do not save recipes until the extracted review content has been checked.
