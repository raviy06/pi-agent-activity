import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function buildDistribution(root) {
 const source=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
 assert.equal(source.private,true,"Source package must remain private");
 assert.equal(source.name,"@raviy06/pi-agent-activity","Unexpected release package identity");
 assert.ok(fs.existsSync(path.join(root,"dist/index.js")),"Run the TypeScript build first");
 const output=path.join(root,"dist-pkg");
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 fs.cpSync(path.join(root,"dist"),path.join(output,"dist"),{recursive:true});
 for(const file of ["README.md","CHANGELOG.md","LICENSE","RELEASING.md"])fs.copyFileSync(path.join(root,file),path.join(output,file));
 const manifest={};
 for(const field of ["name","version","description","license","type","engines","repository","homepage","bugs","peerDependencies","peerDependenciesMeta","pi"]){
  if(source[field]!==undefined)manifest[field]=source[field];
 }
 fs.writeFileSync(path.join(output,"package.json"),JSON.stringify(manifest,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)buildDistribution(process.cwd());
