import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDistribution } from "../scripts/build-package.mjs";

test("distribution is publishable and excludes development files and scripts",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"activity-dist-"));
 try {
  fs.mkdirSync(path.join(root,"dist"));
  fs.mkdirSync(path.join(root,"test"));
  fs.writeFileSync(path.join(root,"dist/index.js"),"export default () => {};\n");
  for(const file of ["README.md","CHANGELOG.md","LICENSE","RELEASING.md"])fs.writeFileSync(path.join(root,file),"fixture\n");
  fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({name:"@raviy06/pi-agent-activity",version:"0.1.1",private:true,type:"module",pi:{extensions:["./dist/index.js"]},scripts:{postinstall:"must not ship"},devDependencies:{typescript:"5.9.3"}}));
  buildDistribution(root);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"dist-pkg/package.json"),"utf8"));
  assert.equal(pkg.name,"@raviy06/pi-agent-activity");
  assert.equal(pkg.version,"0.1.1");
  assert.equal(pkg.private,undefined);assert.equal(pkg.devDependencies,undefined);assert.equal(pkg.scripts,undefined);
  assert.ok(fs.existsSync(path.join(root,"dist-pkg/dist/index.js")));
  assert.equal(fs.existsSync(path.join(root,"dist-pkg/test")),false);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
