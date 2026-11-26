import fs from "node:fs";
import path from "node:path";

/**
 * Organization logo slot. Renders public/brand/logo.svg or logo.png if an
 * authorized deployment has placed one there; otherwise a neutral "FR" tile.
 * No logo, emblem or insignia is bundled with FirstRecord.
 */
function findLogo(): string | null {
  for (const f of ["logo.svg", "logo.png"]) {
    if (fs.existsSync(path.join(/* turbopackIgnore: true */ process.cwd(), "public/brand", f))) return `/brand/${f}`;
  }
  return null;
}

export function OrgLogo({ size = 56, inverted = false }: { size?: number; inverted?: boolean }) {
  const src = findLogo();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={process.env.NEXT_PUBLIC_ORG_NAME || "Organization logo"} width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight ${inverted ? "bg-white text-[#111216]" : "bg-[#111216] text-white"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      FR
    </span>
  );
}
