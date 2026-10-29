// iPhone launch screens in portrait: CSS size, pixel ratio. iOS only shows a
// startup image whose media query matches the device exactly.
const DEVICES = [
  [430, 932, 3], // 14/15/16 Plus & Pro Max
  [440, 956, 3], // 16 Pro Max
  [393, 852, 3], // 14 Pro, 15, 16
  [402, 874, 3], // 16 Pro
  [390, 844, 3], // 12–14
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [375, 812, 3], // X–11 Pro, mini
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE
] as const;

export const SPLASH_SIZES = DEVICES.map(([w, h, r]) => ({ w: w * r, h: h * r, cssW: w, cssH: h, ratio: r }));

export const startupImages = () =>
  SPLASH_SIZES.map((s) => ({
    url: `/splash/${s.w}x${s.h}`,
    media: `(device-width: ${s.cssW}px) and (device-height: ${s.cssH}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`,
  }));
