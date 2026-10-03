import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./startup.js',import.meta.url),'utf8');
function page(){
  const elements=new Map(['start','host-room','open-join','start-summary','load-error','startup-error-detail','reload-data'].map(id=>[id,{disabled:id!=='open-join',hidden:id==='load-error',textContent:'Загружаем…',addEventListener(type,handler){this[type]=handler;}}]));
  const events=new Map();let timeout=null,cleared=false;
  const context={document:{getElementById:id=>elements.get(id)},window:{addEventListener:(type,handler)=>events.set(type,handler)},setTimeout(fn,delay){assert.equal(delay,12000);timeout=fn;return 1;},clearTimeout(){cleared=true;},URL,Date,location:{href:'https://example.test/game/?room=ROOMCODE',replace(href){this.href=href;}}};
  vm.runInNewContext(source,context);return {elements,events,context,timeout:()=>timeout(),cleared:()=>cleared};
}
test('missing application script produces an actionable error, rather than endless loading',()=>{const p=page();p.events.get('error')({target:{tagName:'SCRIPT',hasAttribute:key=>key==='data-quiz-bundle'}});assert.equal(p.elements.get('load-error').hidden,false);assert.match(p.elements.get('startup-error-detail').textContent,/файл приложения/);assert.equal(p.elements.get('host-room').disabled,true);assert.ok(p.cleared());});
test('startup timeout explains failure and refresh preserves room invite',()=>{const p=page();p.timeout();assert.equal(p.elements.get('load-error').hidden,false);assert.match(p.elements.get('start-summary').textContent,/слишком долго/);p.elements.get('reload-data').click();const url=new URL(p.context.location.href);assert.equal(url.searchParams.get('room'),'ROOMCODE');assert.ok(url.searchParams.get('reload'));});
test('successful startup cancels the watchdog; later unrelated errors do not disable the game',()=>{const p=page();p.elements.get('start').disabled=false;p.events.get('quiz:ready')();p.timeout();p.events.get('error')({filename:'extension.js'});assert.equal(p.elements.get('load-error').hidden,true);assert.equal(p.elements.get('start').disabled,false);});
test('reported application initialization error is visible and not replaced by a generic timeout',()=>{const p=page();p.events.get('quiz:failed')({detail:'Не удалось открыть подборку'});assert.equal(p.elements.get('load-error').hidden,false);assert.equal(p.elements.get('startup-error-detail').textContent,'Не удалось открыть подборку');assert.ok(p.cleared());});
test('shipped page uses complete content-addressed classic scripts, with catalogue embedded',()=>{const html=readFileSync(new URL('./index.html',import.meta.url),'utf8'),info=JSON.parse(readFileSync(new URL('./build-info.json',import.meta.url),'utf8'));assert.ok(html.includes(`src="${info.app}"`));assert.ok(html.includes(`src="${info.startup}"`));assert.ok(!html.includes('type="module"'));const code=readFileSync(new URL(info.app,import.meta.url),'utf8');new vm.Script(code);assert.ok(code.includes('Батарейка'));assert.ok(code.includes('Perhaps Perhaps Perhaps'));assert.ok(!code.includes('fetch("./songs.json")'));});
