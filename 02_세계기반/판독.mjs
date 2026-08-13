/* 결과 json 을 분석서 txt 로 바꾼다.
 *
 *   node 판독.mjs _결과/202608120940_XL_SAVANNA_84년.json
 *   node 판독.mjs _결과/*.json          (여러 개도 된다)
 *
 * 서식은 sim/11_분석서.js 에 있다. 여기는 파일을 읽고 쓰는 껍데기다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from './sim/11_분석서.js';

export { buildReport };

export function writeReport(j, outPath) {
  const NL = String.fromCharCode(10);
  fs.writeFileSync(outPath, buildReport(j).join(NL) + NL, 'utf8');
  return outPath;
}

/* 직접 실행하면 인자로 받은 json 을 같은 이름의 txt 로 바꾼다. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('사용법 : node 판독.mjs <결과.json> [...]'); process.exit(1); }
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const out = f.replace(/\.json$/, '.txt');
    writeReport(j, out);
    console.log(`판독 · ${path.basename(out)}`);
  }
}
