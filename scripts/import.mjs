import {readFile,writeFile} from 'node:fs/promises';
import {validate,fromCSV} from '../core.js';
const [file,source,updatedAt]=process.argv.slice(2);
if(!file||!source||!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt||''))throw new Error('用法：npm run import -- <file.csv|json> <來源描述> <資料更新日 YYYY-MM-DD>');
const text=await readFile(file,'utf8');const json=file.endsWith('.csv')?null:JSON.parse(text);
const drugs=file.endsWith('.csv')?fromCSV(text):validate(Array.isArray(json)?json:json.drugs);
if(!drugs.length)throw new Error('拒絕以空資料覆蓋主檔。');
await writeFile(new URL('../data/drugs.json',import.meta.url),JSON.stringify({source,updatedAt,drugs},null,2)+'\n');
console.log(`已匯入 ${drugs.length} 筆。請核對後提交 Git。`);
