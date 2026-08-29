import { writeFileSync } from 'fs';
import { LANGUAGES } from '../src/lib/languages';

for (const lang of LANGUAGES) {
  const path = `download/configs/${lang.id}.plm.json`;
  writeFileSync(path, JSON.stringify(lang.config, null, 2));
  console.log(`Wrote ${path}`);
  
  const samplePath = `download/examples/sample.${lang.extension}`;
  writeFileSync(samplePath, lang.sample);
  console.log(`Wrote ${samplePath}`);
}
