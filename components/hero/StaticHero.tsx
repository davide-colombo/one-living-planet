/**
 * Pre-rendered fallback for no-WebGL and prefers-reduced-motion:
 * an orthographic globe render (scripts/render-static-hero.mjs) with
 * the same palette treatment applied around it in CSS.
 */
export function StaticHero() {
  return (
    <div aria-hidden className="absolute inset-0 flex items-end justify-center overflow-hidden">
      <div
        className="relative"
        style={{
          width: "min(120vw, 130vh)",
          aspectRatio: "1",
          transform: "translateY(52%)",
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: "0 0 120px 20px color-mix(in oklab, var(--rim) 45%, transparent)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative full-bleed render, sized by CSS */}
        <img
          src="/textures/hero-static.webp"
          alt=""
          className="absolute inset-0 h-full w-full"
          draggable={false}
        />
      </div>
    </div>
  );
}
