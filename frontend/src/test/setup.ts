import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't lay pages out, so it has no scrolling; pages that scroll something into view still need the method.
if (typeof Element !== "undefined") Element.prototype.scrollIntoView ??= () => {};

afterEach(() => cleanup());
