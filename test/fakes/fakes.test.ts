import { describePdfEngineContract } from "../contracts/pdf-engine.contract.js";
import { describePdfProcessorContract } from "../contracts/pdf-processor.contract.js";
import { fakeEngineHarness, fakeProcessorHarness } from "./harness.js";

// The fakes pass the same suites as the real adapters, which also proves the
// suites themselves. Rendering runs in the browser project.
describePdfEngineContract("fake engine", fakeEngineHarness(false));
describePdfProcessorContract("fake processor", fakeProcessorHarness);
