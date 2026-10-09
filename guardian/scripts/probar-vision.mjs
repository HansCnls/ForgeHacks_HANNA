// Prueba qué modelos de visión responden hoy con la lectura real.
// Uso: node --env-file=.env.local scripts/probar-vision.mjs <imagen> <modelo1> <modelo2> ...
import { readFileSync } from "node:fs";
import { bufferADataUrl, leerCaptura } from "../lib/lectura.mjs";

const [ruta, ...modelos] = process.argv.slice(2);
const imagen = await bufferADataUrl(readFileSync(ruta));

await Promise.all(
  modelos.map(async (m) => {
    const t = Date.now();
    try {
      const r = await leerCaptura(m, imagen);
      console.log(`OK  ${m} (${((Date.now() - t) / 1000).toFixed(1)}s)`, JSON.stringify({ tipo: r.tipo, marca: r.marca, remitente: r.remitente, confirmados: r.enlaces.confirmados, barra: r.barra }));
    } catch (e) {
      console.log(`ERR ${m} (${((Date.now() - t) / 1000).toFixed(1)}s): ${e.message.slice(0, 90)}`);
    }
  })
);
