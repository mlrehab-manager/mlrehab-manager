import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIdentity } from "../records/identity.mjs";
test("a birth date on the Madrid day is accepted across UTC midnight and a later day is rejected", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-22T23:30:00Z"),
  });
  const identity = {
    given_name: "Persona",
    family_name: "Sintética",
    birth_date: "2026-11-23",
  };
  assert.equal(normalizeIdentity(identity).birth_date, "2026-11-23");
  assert.throws(() =>
    normalizeIdentity({ ...identity, birth_date: "2026-11-24" }),
  );
});
