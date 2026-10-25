// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PeoplePicker } from "../src/PeoplePicker";
import { MentionInput, MentionText } from "../src/Mentions";
import { fixtureState } from "../shared/fixtures";
import type { Mention } from "../shared/model";
const members = fixtureState().members;
afterEach(cleanup);
function Picker() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <PeoplePicker
      label="Collaborators"
      name="collaborator"
      value={selected}
      onChange={setSelected}
      members={members}
      multiple
    />
  );
}
it("lets keyboard users find a collaborator by email, select a chip and remove it", () => {
  const { container } = render(<Picker />);
  const search = screen.getByRole("combobox", { name: "Collaborators" });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: "amira@example" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.keyDown(search, { key: "Enter" });
  expect(
    container
      .querySelector('input[name="collaborator"]')
      ?.getAttribute("value"),
  ).toBe("demo-amira");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove collaborator Amira Chen" }),
  );
  expect(container.querySelector('input[name="collaborator"]')).toBeNull();
});
function Editor() {
  const [text, setText] = useState(""),
    [mentions, setMentions] = useState<Mention[]>([]);
  return (
    <>
      <MentionInput
        label="Description"
        name="description"
        members={members}
        value={text}
        mentions={mentions}
        onChange={(text, mentions) => {
          setText(text);
          setMentions(mentions);
        }}
      />
      <output>
        <MentionText text={text} mentions={mentions} members={members} />
      </output>
    </>
  );
}
it("selects a highlighted identity mention by username and Escape dismisses suggestions", () => {
  const { container } = render(<Editor />);
  const input = screen.getByRole("textbox", { name: "Description" });
  fireEvent.focus(input);
  fireEvent.change(input, {
    target: { value: "Ask @amira.chen", selectionStart: 15 },
  });
  fireEvent.keyDown(input, { key: "Enter" });
  expect((input as HTMLTextAreaElement).value).toBe("Ask @amira.chen ");
  expect(container.querySelector("output .person-mention")?.textContent).toBe(
    "@amira.chen",
  );
  const refs = JSON.parse(
    container
      .querySelector('input[name="descriptionMentions"]')!
      .getAttribute("value")!,
  );
  expect(refs).toEqual([{ memberId: "demo-amira", start: 4, end: 15 }]);
  fireEvent.change(input, { target: { value: "@daniel", selectionStart: 7 } });
  expect(
    screen.getByRole("listbox", { name: "Mention suggestions" }),
  ).toBeTruthy();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
});
