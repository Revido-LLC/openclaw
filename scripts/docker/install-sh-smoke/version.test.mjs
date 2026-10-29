import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const expected = "2026.10.8";
const script = new URL("./run.sh", import.meta.url).pathname;

function runSmoke(version) {
  const bin = mkdtempSync(join(tmpdir(), "openclaw-install-version-"));
  try {
    for (const [name, contents] of Object.entries({
      npm: '#!/bin/sh\nprintf "%s\\n" "$MOCK_EXPECTED_VERSION"\n',
      curl: '#!/bin/sh\nprintf "exit 0\\n"\n',
      openclaw:
        '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "%s\\n" "$MOCK_CLI_VERSION"; fi\n',
    })) {
      const command = join(bin, name);
      writeFileSync(command, contents, { mode: 0o755 });
    }
    return spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:/usr/bin:/bin`,
        MOCK_EXPECTED_VERSION: expected,
        MOCK_CLI_VERSION: version,
        OPENCLAW_INSTALL_SMOKE_PREVIOUS: "2026.10.7",
        OPENCLAW_INSTALL_SMOKE_SKIP_PREVIOUS: "1",
      },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

for (const version of [expected, `OpenClaw ${expected} (dc2523e)`]) {
  void test(`accepts installed version ${version}`, () => {
    const result = runSmoke(version);
    assert.equal(result.status, 0, result.stderr);
  });
}

for (const version of ["2026.10.7", "OpenClaw 2026.10.7 (dc2523e)", `Other ${expected}`]) {
  void test(`rejects installed version ${version}`, () => {
    const result = runSmoke(version);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /ERROR: expected/);
  });
}
