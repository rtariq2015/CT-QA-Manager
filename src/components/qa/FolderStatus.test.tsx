import { act, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { recordFolderCheck } from "@/lib/qa-logger";
import { DEFAULT, SETTINGS_KEY, type Source } from "@/lib/qa-settings";
import { ScannerLights } from "./FolderStatus";

it("shows a failed intake folder even when another folder for the scanner is reachable", () => {
  const first: Source = { name: "Main scanner", path: "C:\\QA", scanner: "edge", kind: "local" };
  const second: Source = { name: "Alternate intake", path: "E:\\QA", scanner: "edge", kind: "local" };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT, sources: [first, second] }));
  recordFolderCheck(first, true);

  render(<ScannerLights />);
  expect(screen.getByText("Main scanner")).toBeInTheDocument();
  expect(screen.queryByText("Alternate intake")).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Folder checks pending" })).toBeInTheDocument();

  act(() => recordFolderCheck(second, false));
  expect(screen.getByRole("img", { name: "A folder check failed" })).toBeInTheDocument();

  act(() => recordFolderCheck(second, true));
  expect(screen.getByRole("img", { name: "All folder checks succeeded" })).toBeInTheDocument();
});
