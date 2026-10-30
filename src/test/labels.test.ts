import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".tsx") && !e.name.includes(".test.") ? [path.join(dir, e.name)] : []));

describe("labels people hear and read", () => {
  // VoiceOver reads aria-labels aloud; a hard-coded English one is wrong in Hebrew.
  it("no hard-coded English labels, titles, placeholders or alt text in components", () => {
    const allowed = new Set(['aria-label="WhatsApp"', 'placeholder="https://"']);
    const found = files(root).flatMap((f) =>
      [...fs.readFileSync(f, "utf8").matchAll(/(aria-label|title|placeholder|alt)="[A-Za-z][^"{]*"/g)]
        .map((m) => m[0])
        .filter((m) => !allowed.has(m))
        .map((m) => `${path.relative(root, f)}: ${m}`),
    );
    expect(found).toEqual([]);
  });

});
