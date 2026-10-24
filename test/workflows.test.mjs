import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for(const newline of ["\n","\r\n"])test(`PR CI policy works with ${newline.length===1?"LF":"CRLF"} checkouts`,()=>{
 const workflow=fs.readFileSync(".github/workflows/ci.yml","utf8").replace(/\r?\n/g,newline);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/permissions:\r?\n {2}contents: read/);
 assert.match(workflow,/name: CI\r?\n {4}if: always\(\)/);
 assert.match(workflow,/npm run check:release -- --base/);
 assert.match(workflow,/npm run lint/);
 assert.match(workflow,/npm run typecheck/);
 assert.match(workflow,/python3 scripts\/smoke.py/);
 assert.doesNotMatch(workflow,/pull_request_target|id-token: write|secrets\./);
});
test("publishing is CI-gated, main-only, environment-protected and scoped",()=>{
 const workflow=fs.readFileSync(".github/workflows/release.yml","utf8");
 for(const pattern of [/workflow_run:/,/conclusion == 'success'/,/github\.repository == 'raviy06\/pi-agent-activity'/,/head_branch == 'main'/,/environment: npm/,/Require successful main CI for this exact commit/,/npm run check:release -- --packed/,/npm publish \.\/dist-pkg --provenance --access public/])assert.match(workflow,pattern);
 assert.doesNotMatch(workflow,/pull_request_target|NPM_TOKEN|registry-url:/);
});
