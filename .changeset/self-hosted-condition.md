---
"@hussmartinez/pdf-sdk": minor
---

A build that self-hosts the SDK's assets can now leave the inlined workers out. Set the `hm-self-hosted` resolve condition in your bundler, for example `resolve: { conditions: [...defaultClientConditions, "hm-self-hosted"] }` in Vite, and the inlined render and processing workers, their WebAssembly decoders and pdf.js's inlined data files resolve to a small stub instead, saving about 5 MB of chunks your app never loaded. With the condition set, every engine and processor needs `assetsUrl`; a worker started without it fails with `WORKER_START_FAILED`, whose `details` are `{ condition: "hm-self-hosted", missing: "assetsUrl" }`. Without the condition nothing changes. The README shows the Vite and esbuild settings.
