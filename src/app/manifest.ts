import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Brain",
    short_name: "Brain",
    description: "Your home, thinking ahead.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f3fb",
    theme_color: "#7457ff",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
