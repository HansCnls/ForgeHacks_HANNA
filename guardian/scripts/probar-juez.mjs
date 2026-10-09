// Prueba lupa + juez sin la parte de visión.
// Uso: node --env-file=.env.local scripts/probar-juez.mjs <url> <marca> "<mensaje>" [remitente]
import { investigar } from "../lib/lupa.mjs";
import { juzgar } from "../lib/juez.mjs";

const [url, marca, mensaje, remitente] = process.argv.slice(2);
const lectura = {
  tipo: "sms_chat",
  marca: marca || null,
  mensaje: mensaje || null,
  que_se_pide: null,
  remitente: remitente || null,
  barra: null,
  enlaces: { confirmados: url ? [url] : [], dudosos: [] },
};
const investigacion = url ? await investigar([url], lectura.marca) : [];
console.log("LUPA:", JSON.stringify(investigacion, null, 2));
const veredicto = await juzgar(lectura, investigacion);
console.log("JUEZ:", JSON.stringify(veredicto, null, 2));
