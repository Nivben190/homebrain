// The Home Brain mark (roadmap 2.12): a house whose window is a spark, drawn
// as SVG so it stays crisp at any size instead of a rendered emoji.

export const BRAND_GRADIENT = "linear-gradient(135deg, #7457ff 0%, #b65cff 50%, #ff6fa8 100%)";

export function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path d="M18 46 L50 20 L82 46 V80 a6 6 0 0 1 -6 6 H24 a6 6 0 0 1 -6 -6 Z" stroke="white" strokeWidth="7" strokeLinejoin="round" />
      <path d="M50 44 C51.5 53 53 54.5 62 56 C53 57.5 51.5 59 50 68 C48.5 59 47 57.5 38 56 C47 54.5 48.5 53 50 44 Z" fill="white" />
    </svg>
  );
}
