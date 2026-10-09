// Ruta que usa la interfaz (public/index.html): POST /analizar
// Recibe multipart/form-data con el campo "captura" y responde
// { veredicto, resumen, senales: [{titulo, detalle}], acciones }
import { bufferADataUrl, leerConRespaldo } from "../../lib/lectura.mjs";
import { investigar } from "../../lib/lupa.mjs";
import { juzgarEn } from "../../lib/juez.mjs";

export const maxDuration = 60;

export async function POST(request) {
  const inicio = Date.now();

  let archivo;
  try {
    const form = await request.formData();
    archivo = form.get("captura");
  } catch {
    return Response.json({ error: "No image" }, { status: 400 });
  }
  if (!archivo || typeof archivo.arrayBuffer !== "function") {
    return Response.json({ error: "No image" }, { status: 400 });
  }

  let imagen;
  try {
    imagen = await bufferADataUrl(Buffer.from(await archivo.arrayBuffer()));
  } catch {
    return Response.json({ error: "Invalid image" }, { status: 400 });
  }

  let lectura, modelo;
  try {
    ({ lectura, modelo } = await leerConRespaldo(imagen));
  } catch (e) {
    console.error("Lectura:", e.detalle || e.message);
    return Response.json({ error: "Analysis failed" }, { status: 502 });
  }

  let investigacion = [];
  try {
    investigacion = await investigar(lectura.para_revisar, lectura.marca);
  } catch (e) {
    console.error("Lupa: " + e.message);
  }

  const veredicto = await juzgarEn(lectura, investigacion, { hasta: inicio + 55000 });
  console.log("Análisis:", { modelo, tipo: lectura.tipo, marca: lectura.marca, veredicto: veredicto.veredicto, fuente: veredicto.fuente });

  return Response.json({
    ...veredicto,
    // Datos extra (la interfaz no los muestra, sirven para depurar)
    lectura,
    investigacion,
    modelo_usado: modelo,
  });
}
