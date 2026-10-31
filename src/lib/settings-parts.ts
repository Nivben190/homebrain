// Me is a short menu; each group opens as its own page (`/me/<part>`).
export type SettingsPart = "menu" | "profile" | "notifications" | "family" | "connections" | "data";
export const SETTINGS_PARTS: Exclude<SettingsPart, "menu">[] = ["profile", "notifications", "family", "connections", "data"];
