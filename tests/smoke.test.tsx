import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

test("renders React Testing Library in jsdom", () => {
  render(<p>Testing infrastructure is ready.</p>);

  expect(screen.getByText("Testing infrastructure is ready.")).toBeInTheDocument();
});
