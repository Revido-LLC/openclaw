import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const read = (name) =>
  readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
const job = (text, name) => {
  const match = text.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:|(?![\\s\\S]))`, "m"),
  );
  assert.ok(match, `missing ${name}`);
  return match[1];
};
const evaluate = (expression, event, draft) =>
  runInNewContext(expression.replaceAll("needs.docs-scope", 'needs["docs-scope"]'), {
    github: { event_name: event, event: { pull_request: { draft } } },
    needs: { "docs-scope": { outputs: { docs_only: "false", docs_changed: "true" } } },
  });
const field = (block, key) => {
  const match = block.match(new RegExp(`^    ${key}: (.+)$`, "m"));
  assert.ok(match);
  return match[1].replace(/^\$\{\{\s*|\s*\}\}$/g, "");
};

void test("drafts fail closed while security and ready validation remain enabled", () => {
  const ci = read("ci");
  const sentinel = job(ci, "draft-pending");
  assert.match(sentinel, /exit 1/);
  assert.equal(evaluate(field(sentinel, "name"), "pull_request", true), "check");
  assert.match(job(ci, "secrets"), /detect-secrets scan --baseline/);
  assert.doesNotMatch(job(ci, "secrets"), /^    if:/m);
  /** @type {Array<[string, string[]]>} */
  const cases = [
    ["ci", ["changed-scope", "check", "check-docs"]],
    ["install-smoke", ["install-smoke"]],
    ["formal-conformance", ["formal_conformance"]],
    ["sandbox-common-smoke", ["sandbox-common-smoke"]],
  ];
  for (const [workflow, names] of cases) {
    const text = read(workflow);
    assert.match(
      text,
      /types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/,
    );
    for (const name of names) {
      const condition = field(job(text, name), "if");
      assert.equal(evaluate(condition, "pull_request", true), false, `${workflow}/${name}`);
      assert.equal(evaluate(condition, "pull_request", false), true, `${workflow}/${name}`);
      assert.equal(evaluate(condition, "push", false), true, `${workflow}/${name}`);
    }
  }
});
