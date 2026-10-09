import { leerConRespaldo } from "../../../lib/lectura.mjs";
import { investigar } from "../../../lib/lupa.mjs";
import { juzgar } from "../../../lib/juez.mjs";

export const maxDuration = 60;

// Respuesta completa en JSON (datos técnicos). La interfaz usa /analizar.
export async function POST(request) {
  const inicio = Date.now();
  const { imagen } = await request.json();
  if (!imagen) {
    return Response.json({ error: "Falta la imagen" }, { status: 400 });
  }

  let lectura, modelo;
  try {
    ({ lectura, modelo } = await leerConRespaldo(imagen));
  } catch (e) {
    return Response.json(
      { error: "El servicio de IA está ocupado. Inténtalo de nuevo en un minuto.", detalle: e.detalle },
      { status: 502 }
    );
  }

  let investigacion = [];
  try {
    investigacion = await investigar(lectura.para_revisar, lectura.marca);
  } catch (e) {
    console.error("Lupa: " + e.message);
  }

  let veredicto = null;
  try {
    veredicto = await juzgar(lectura, investigacion, { hasta: inicio + 55000 });
  } catch (e) {
    console.error("Juez: " + e.message);
  }

  return Response.json({ ...lectura, investigacion, veredicto, modelo_usado: modelo });
}