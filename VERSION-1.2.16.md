# Cooking Confidential V1.2.16

## Fix
- Corrected generic DOCX recipe-heading detection.
- Ingredient lines containing a quantity/unit are no longer treated as recipe headings.
- Instruction/reference lines such as “Use above dough…” are no longer treated as recipe headings.
- The supplied Focassia/Hard Roll document should therefore produce the two actual recipe sections rather than false recipe sections.
- DOCX review cache version bumped to ensure the browser loads the corrected parser.

## Scope
This is a generic parser correction, not a recipe-specific rule for Focassia or Hard Roll.

Authentication is unchanged.
