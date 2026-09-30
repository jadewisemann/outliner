import { describe, expect, it } from "vitest";
import { readPayload } from "@/entities/outline";
import { mergeWorkspace } from "../merge";

/** Whatever a sync endpoint or an imported file hands us, it must not crash the app. */
const HOSTILE: [string, unknown][] = [
  ["not an object", "hello"],
  ["null", null],
  ["docs missing", {}],
  ["docs not an object", { docs: [] }],
  ["graves missing", { docs: {} }],
  ["a null document", { docs: { a: null }, graves: {} }],
  ["a document with no root", { docs: { a: { id: "a", rootId: "r", nodes: {} } }, graves: {} }],
  ["nodes not an object", { docs: { a: { rootId: "r", nodes: 7 } }, graves: {} }],
  ["graves not an object", { docs: {}, graves: "x" }],
  ["a node id of __proto__", { docs: { a: { rootId: "r", nodes: { r: {}, __proto__: {} } } }, graves: {} }],
  ["a node id of constructor", { docs: { a: { rootId: "r", nodes: { r: {}, constructor: {} } } }, graves: {} }],
  ["a document id of __proto__", { docs: { __proto__: { rootId: "r", nodes: { r: {} } } }, graves: {} }]
];

describe("a hostile payload, validated, then merged", () => {
  it.each(HOSTILE)("survives %s", (_label, value) => {
    const payload = readPayload(value);
    expect(() => mergeWorkspace({ docs: {}, graves: {}, keymap: null }, payload ?? { docs: {}, graves: {}, keymap: null })).not.toThrow();
  });
});
