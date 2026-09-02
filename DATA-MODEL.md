# Cooking Confidential — Initial Data Model

## Recipe

Core fields:
- id
- name
- description
- cuisine
- country
- region
- course
- ingredients
- method
- preparation_time
- cooking_time
- servings
- difficulty
- occasion
- dietary_tags
- rating
- personal_notes
- source_type
- source_url
- source_title
- created_at
- updated_at

## Menu

Core fields:
- id
- name
- date
- occasion
- guest_count
- notes
- created_by
- created_at
- updated_at

Menu items reference recipes rather than copying recipe text. Copying a menu creates a new menu with the same recipe references, so the original menu remains unchanged.

## Recipe sources / imports

An import should retain:
- original file where applicable
- source URL where applicable
- extracted text
- extraction status
- review status
- final recipe record

For social-media sources, the application stores recipe content and source URL, not the source video/image.

## Sharing

Initial sharing model:
- owner/private
- selected family members
- recipe/menu-level sharing can be introduced if useful

Avoid building public accounts or a complex role system unless a later requirement justifies it.
