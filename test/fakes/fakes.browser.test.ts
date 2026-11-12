import { describePdfEngineContract } from "../contracts/pdf-engine.contract.js";
import { fakeEngineHarness } from "./harness.js";

describePdfEngineContract("fake engine in a browser", fakeEngineHarness(true));
