// 캐시 무효화: 모든 상대 경로 import와 index.html의 main.js / styles.css 주소에 ?v=버전 을 붙인다.
// GitHub Pages는 파일을 몇 분간 캐시하므로, 배포 전에 실행하면 브라우저가 항상 새 파일을 받는다.
// 사용: node scripts/bump-version.mjs [버전]   (생략하면 현재 시각)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2] || Date.now().toString(36);
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'vendor') walk(p); }
    else if (p.endsWith('.js')) files.push(p);
  }
};
walk('src');

let changed = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const out = s.replace(/(from\s+'\.{1,2}\/[^'?]+\.js)(\?v=[\w-]+)?'/g, `$1?v=${version}'`);
  if (out !== s) { writeFileSync(f, out); changed++; }
}
const html = readFileSync('index.html', 'utf8')
  .replace(/src="src\/ui\/main\.js(\?v=[\w-]+)?"/, `src="src/ui/main.js?v=${version}"`)
  .replace(/href="styles\.css(\?v=[\w-]+)?"/, `href="styles.css?v=${version}"`);
writeFileSync('index.html', html);
console.log(`version ${version}: ${changed} files + index.html`);
