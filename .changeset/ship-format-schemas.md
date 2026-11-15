---
"@hussmartinez/pdf-sdk": patch
---

The JSON Schemas of the portable formats now ship with the package, so you can validate documents against the version that matches your installed reader, such as on a server that stores them: `@hussmartinez/pdf-sdk/formats/hm-pdf-plan/v1.schema.json` and `@hussmartinez/pdf-sdk/formats/hm-pdf-command/v1.schema.json`. `docs/formats/hm-pdf-plan.md` shows how to load them with Ajv.
