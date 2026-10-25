import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps application CSS free of shadows and background blur", () => {
  const dir = new URL("../src/", import.meta.url);
  const violations: string[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".css"))) {
    const css = readFileSync(new URL(file, dir), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    for (const match of css.matchAll(
      /(?:box-shadow|text-shadow|backdrop-filter)\s*:\s*([^;}]+)/g,
    )) {
      if (match[1].replace(/!important/g, "").trim() !== "none")
        violations.push(`${file}: ${match[0]}`);
    }
    for (const match of css.matchAll(/filter\s*:\s*[^;}]*drop-shadow\([^;}]+/g))
      violations.push(`${file}: ${match[0]}`);
  }
  expect(violations).toEqual([]);
});
