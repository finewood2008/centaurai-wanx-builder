import {readFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {packageMac,electronTemplate} from '../core/packager.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
if(!process.argv[2])throw new Error('Provide an application definition JSON file');
const input=JSON.parse(await readFile(resolve(process.argv[2]),'utf8'));
const product=JSON.parse(await readFile(resolve(root,'product.json'),'utf8'));
let template=resolve(root,'release',`wanx-builder-${product.version}.app`);
try{await access(template);}catch{template=electronTemplate(require('electron'));}
console.log(await packageMac({root,template,destination:process.argv[3]?resolve(process.argv[3]):resolve(root,'release'),product,definition:input.definition??input}));
