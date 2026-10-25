import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const publicDir = new URL("../public/", import.meta.url);
const brandDir = new URL("brand/", publicDir);
const body = (svg) =>
  svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const mark = body(await readFile(new URL("kazi-mark.svg", brandDir), "utf8"));
const wordmark = body(
  await readFile(new URL("../branding/wordmark.svg", import.meta.url), "utf8"),
);
const svg = (width, height, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>\n`;
const lockup = (dark = false) =>
  svg(
    1168,
    376,
    `${mark}<g transform="translate(528 120)">${dark ? wordmark.replaceAll("#111111", "#FFFFFF") : wordmark}</g>`,
  );
await mkdir(brandDir, { recursive: true });
await writeFile(new URL("kazi-logo.svg", brandDir), lockup());
await writeFile(new URL("kazi-logo-dark.svg", brandDir), lockup(true));
// Square launch icons have an opaque background. Only the maskable variant
// needs the additional clearance for launchers that crop to a circle.
const appIcon = (maskable = false) =>
  svg(
    512,
    512,
    `<rect width="512" height="512" fill="#151118"/><g transform="${maskable ? "translate(102.4 135.68) scale(.64)" : "translate(59.2 101.84) scale(.82)"}">${mark}</g>`,
  );
const icon = appIcon();
await writeFile(new URL("momentum-app.svg", brandDir), icon);
for (const [name, size] of [
  ["momentum-192.png", 192],
  ["momentum-512.png", 512],
  ["momentum-maskable.png", 512],
  ["momentum-apple-touch.png", 180],
])
  await sharp(Buffer.from(appIcon(name.includes("maskable"))))
    .resize(size, size)
    .png()
    .toFile(new URL(name, publicDir).pathname);

const favicon = svg(
  32,
  32,
  `<g transform="translate(0 3.4667) scale(.0666667)">${mark}</g>`,
);
await writeFile(new URL("momentum-favicon.svg", publicDir), favicon);
const faviconImages = [];
for (const size of [16, 32, 48]) {
  const png = await sharp(Buffer.from(favicon))
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(new URL(`momentum-favicon-${size}.png`, publicDir), png);
  faviconImages.push({ size, png });
}
// ICO supports PNG entries; include actual 16/32/48px rasters for legacy clients.
const header = Buffer.alloc(6 + faviconImages.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(faviconImages.length, 4);
let offset = header.length;
faviconImages.forEach(({ size, png }, index) => {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(
  new URL("favicon.ico", publicDir),
  Buffer.concat([header, ...faviconImages.map(({ png }) => png)]),
);
// Keep existing bookmarked asset URLs current while versioned names let installed
// clients pick up the new identity without reusing an old icon from their cache.
await writeFile(new URL("icon.svg", publicDir), icon);
for (const [oldName, newName] of [
  ["icon-192.png", "momentum-192.png"],
  ["icon-512.png", "momentum-512.png"],
  ["icon-maskable.png", "momentum-maskable.png"],
  ["apple-touch-icon.png", "momentum-apple-touch.png"],
])
  await writeFile(
    new URL(oldName, publicDir),
    await readFile(new URL(newName, publicDir)),
  );
console.log(
  "Momentum logos, favicons, Apple touch icon, and PWA icons generated.",
);

const previewDir = new URL("../../docs/brand/", import.meta.url);
await mkdir(previewDir, { recursive: true });
const preview = svg(
  1280,
  800,
  `
  <rect width="1280" height="800" fill="#FFFFFF"/>
  <g transform="translate(72 56) scale(.86)">${body(lockup())}</g>
  <defs>
    <clipPath id="rounded"><rect width="512" height="512" rx="112"/></clipPath>
    <clipPath id="circle"><circle cx="256" cy="256" r="256"/></clipPath>
  </defs>
  <g transform="translate(72 448) scale(.46875)" clip-path="url(#rounded)">${body(icon)}</g>
  <g transform="translate(368 448) scale(.46875)" clip-path="url(#circle)">${body(appIcon(true))}</g>
  <g transform="translate(720 476) scale(.0333333)">${mark}</g>
  <g transform="translate(792 464) scale(.0666667)">${mark}</g>
  <g font-family="Arial, sans-serif" fill="#111111" font-size="18">
    <text x="72" y="730">App icon</text><text x="368" y="730">Maskable icon</text>
    <text x="714" y="538">16px</text><text x="784" y="538">32px</text>
    <circle cx="730" cy="606" r="12" fill="#FF8A32"/><text x="756" y="613">Orange · #FF8A32</text>
    <circle cx="730" cy="650" r="12" fill="#E9488B"/><text x="756" y="657">Pink · #E9488B</text>
    <circle cx="730" cy="694" r="12" fill="#4263EB"/><text x="756" y="701">Cobalt · #4263EB</text>
  </g>`,
);
await writeFile(new URL("momentum-preview.svg", previewDir), preview);
await sharp(Buffer.from(preview))
  .png()
  .toFile(new URL("momentum-preview.png", previewDir).pathname);
