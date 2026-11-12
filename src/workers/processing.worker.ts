// The processing worker, inlined (docs/adr/0002): qpdf and pdf-lib behind the
// family's worker RPC, with qpdf's WebAssembly inlined into the worker after
// its hash was checked at build time. Nothing is ever fetched.
import { exposeProcessing } from "../adapters/qpdf/expose.js";
import { inlinedWasm } from "../adapters/qpdf/toolkit.js";

exposeProcessing(inlinedWasm);
