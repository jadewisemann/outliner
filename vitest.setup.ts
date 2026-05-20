import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const createEmptyRect = (): DOMRect => ({
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({})
});

if (typeof globalThis.Text !== "undefined") {
  const textPrototype = globalThis.Text.prototype as unknown as {
    getBoundingClientRect?: () => DOMRect;
  };
  textPrototype.getBoundingClientRect ??= createEmptyRect;
}

if (typeof globalThis.Range !== "undefined") {
  const rangePrototype = globalThis.Range.prototype as unknown as {
    getBoundingClientRect?: () => DOMRect;
    getClientRects?: () => DOMRectList;
  };
  rangePrototype.getBoundingClientRect ??= createEmptyRect;
  rangePrototype.getClientRects ??= (() => [] as unknown as DOMRectList);
}

if (typeof globalThis.Selection !== "undefined") {
  const selectionPrototype = globalThis.Selection.prototype as unknown as {
    modify?: () => void;
  };
  selectionPrototype.modify ??= () => {};
}

afterEach(() => {
  cleanup();
});
