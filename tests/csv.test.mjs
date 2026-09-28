import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/csv.ts";

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv(
    'primary_contact_name,email,address_line1\r\n"Smith, John",john@example.com,"100 ""Main"" St"\r\n'
  );

  assert.deepEqual(rows, [
    ["primary_contact_name", "email", "address_line1"],
    ["Smith, John", "john@example.com", '100 "Main" St'],
  ]);
});

test("parseCsv handles quoted newlines and blank trailing rows", () => {
  const rows = parseCsv(
    'name,notes\nJane,"Line one\nLine two"\n\n'
  );

  assert.deepEqual(rows, [
    ["name", "notes"],
    ["Jane", "Line one\nLine two"],
    ["", ""],
  ]);
});
