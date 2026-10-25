import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, it } from "vitest";

const asset = (name: string) => new URL(`../public/${name}`, import.meta.url);

it("exports opaque launch icons at their declared sizes", async () => {
  for (const [name, size] of [
    ["momentum-192.png", 192],
    ["momentum-512.png", 512],
    ["momentum-maskable.png", 512],
    ["momentum-apple-touch.png", 180],
  ] as const) {
    const { data, info } = await sharp(await readFile(asset(name)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([size, size]);
    let translucent = 0;
    for (let p = 3; p < data.length; p += 4) if (data[p] !== 255) translucent++;
    expect(translucent).toBe(0);
  }
});

it("keeps the full maskable symbol inside the central safe circle", async () => {
  const { data, info } = await sharp(
    await readFile(asset("momentum-maskable.png")),
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let outside = 0;
  let foreground = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 3;
      if (data[p] === 21 && data[p + 1] === 17 && data[p + 2] === 24) continue;
      foreground++;
      if (Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 204.8) outside++;
    }
  expect(foreground).toBeGreaterThan(20_000);
  expect(outside).toBe(0);
});

it("preserves three distinguishable colors in real 16px and 32px favicons", async () => {
  for (const size of [16, 32]) {
    const { data, info } = await sharp(
      await readFile(asset(`momentum-favicon-${size}.png`)),
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([size, size]);
    for (const color of [
      [255, 138, 50],
      [233, 72, 139],
      [66, 99, 235],
    ]) {
      let pixels = 0;
      for (let p = 0; p < data.length; p += 4)
        if (
          color.every((value, channel) => data[p + channel] === value) &&
          data[p + 3] > 240
        )
          pixels++;
      expect(pixels, `${size}px ${color}`).toBeGreaterThan(3);
    }
    expect(data[3]).toBe(0);
  }
});
