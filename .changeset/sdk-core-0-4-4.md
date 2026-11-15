---
"@hussmartinez/pdf-sdk": patch
---

The SDK now depends on `@hussmartinez/sdk-core` `^0.4.4` and `@hussmartinez/ui` `^0.7.0`, and ui itself uses that sdk-core, so an application gets one copy of each. If your application depends on ui or sdk-core directly, move to the same minor versions and check that `npm ls @hussmartinez/ui @hussmartinez/sdk-core` lists one version of each. `PdfEditor` and `PdfSessionProvider` take their `messages` overrides as before.
