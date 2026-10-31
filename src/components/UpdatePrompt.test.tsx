// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderUi } from "@/test/ui";

process.env.NEXT_PUBLIC_BUILD_ID = "build-a";
const { UpdatePrompt } = await import("./UpdatePrompt");

function serving(build: string) {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ build })));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("update prompt", () => {
  it("stays out of the way while the open page is the live deploy", async () => {
    const fetch = serving("build-a");
    renderUi(<UpdatePrompt />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/version", { cache: "no-store" }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a refresh once a new deploy is live", async () => {
    serving("build-b");
    const { t } = renderUi(<UpdatePrompt />);
    expect(await screen.findByRole("button", { name: `${t.update.ready} · ${t.update.refresh}` })).toBeInTheDocument();
  });

  it("asks again when the app comes back to the front", async () => {
    const fetch = serving("build-a");
    const { t } = renderUi(<UpdatePrompt />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    serving("build-b");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findByRole("button", { name: `${t.update.ready} · ${t.update.refresh}` })).toBeInTheDocument();
  });

  it("says nothing when the check fails", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    renderUi(<UpdatePrompt />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
  });
});
