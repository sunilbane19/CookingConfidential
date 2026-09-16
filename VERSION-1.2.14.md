# Cooking Confidential V1.2.14

Generic shared-base recipe inheritance added on top of V1.2.13.

The extractor now recognizes references such as “same process”, “same method”, “same dough”, “use the above dough”, and “as described above”. Where the source clearly refers back to an earlier recipe, the importer can inherit the base ingredients/process and retain the recipe-specific differences in Notes/description.

This is deliberately generic and is not hard-coded to Soft Roll, Focaccia or Hard Roll.
