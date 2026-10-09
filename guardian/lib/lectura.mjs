// "Los ojos": lectura de la captura con IA de visión (cadena de modelos de respaldo).
import sharp from "sharp";

export const MODELOS_VISION = [
  "Qwen/Qwen3-VL-30B-A3B-Instruct",
];

const TIPOS = ["sms_chat", "correo", "pagina_web", "otro"];

const INSTRUCCION = `Eres un lector de capturas de pantalla. Transcribe, no interpretes.
Devuelve SOLO un objeto JSON, sin texto antes ni después, con EXACTAMENTE estas claves (si un dato no se ve, pon null; nunca omitas una clave):
- "tipo": usa SOLO una de estas palabras: "sms_chat" (conversación de mensajes: SMS, WhatsApp, etc.), "correo" (correo electrónico), "pagina_web" (página web en un navegador) u "otro".
- "marca_mencionada": el nombre de la empresa, banco o servicio que el mensaje, correo o página dice ser (por su logo o su texto). Si no menciona ninguno, null.
- "mensaje": el texto principal del mensaje, correo o página, copiado tal cual y en una sola línea. No incluyas la hora, la fecha ni etiquetas del operador o de la SIM. Si hay varios mensajes, sepáralos con " | ".
- "enlaces": lista de direcciones web que se VEAN escritas en la imagen, copiadas letra por letra. Si una dirección se parte en dos líneas, únela sin espacios e incluye todo lo que va después de la última barra. No inventes direcciones: si un botón o texto subrayado no muestra su dirección, no lo incluyas.
- "que_se_pide": en una frase, qué le piden hacer a la persona. Si no piden nada, null.
No expliques tu razonamiento.`;

const PREGUNTA_ENLACES = `Lista las direcciones web (URL) que estén ESCRITAS literalmente como texto en esta imagen. Copia solo lo que se lee, letra por letra. NO deduzcas direcciones a partir de logos, marcas, botones ni textos subrayados que no muestren la dirección. Si una dirección se parte en dos líneas, únela sin espacios e incluye todo hasta el final. Responde SOLO con un JSON de esta forma: {"enlaces": ["..."]}. Si no hay ninguna, responde: {"enlaces": []}`;

const PREGUNTA_REMITENTE =
  "Esta es una captura de pantalla de una conversación de mensajes o de un correo. ¿Quién lo envía? Busca el número de teléfono, el nombre del contacto o la dirección de correo del remitente en CUALQUIER parte de la pantalla. No uses la hora, la fecha, el nombre del operador o de la SIM, ni contadores de mensajes sin leer (un número dentro de un círculo o globo). No uses texto que esté dentro del propio mensaje. Responde SOLO con ese dato, tal como se ve. Si no se ve ninguno, responde: NINGUNO.";

const PREGUNTA_BARRA =
  "Esta imagen muestra la parte superior de una página web en un navegador. ¿Qué dirección aparece en la barra de direcciones? Copia el dominio y la ruta letra por letra, sin añadir https:// ni corregir nada. Si no se ve ninguna barra de direcciones, responde: NINGUNA.";

// ---------- Utilidades ----------

async function llamar(modelo, imagen, texto, maxTokens) {
  const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: texto },
            { type: "image_url", image_url: { url: imagen } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const choice = data.choices[0];
  if (choice.finish_reason === "length") throw new Error("La respuesta se cortó");
  return (choice.message.content || "").trim();
}

function leerJson(texto) {
  try {
    return JSON.parse(texto.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

const limpiarUrl = (u) => String(u ?? "").replace(/\s+/g, "");
const norm = (u) =>
  limpiarUrl(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
const host = (u) => norm(u).split(/[/?#]/)[0];

// Solo cuenta como enlace lo que parece una dirección web (no "Activación" ni correos)
const parecidoAUrl = (u) =>
  !u.includes("@") && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u);

const listaDeEnlaces = (x) =>
  Array.isArray(x) ? x.map(limpiarUrl).filter(parecidoAUrl) : [];

function validarRemitente(remitente, mensaje) {
  const r = String(remitente ?? "").trim();
  if (!r || /^ningun[oa]$/i.test(r)) return null;
  // Si aparece dentro del texto del mensaje, el modelo lo copió de ahí: se descarta
  if (String(mensaje ?? "").toLowerCase().includes(r.toLowerCase())) return null;
  return r;
}

// Recorta la parte de arriba de la imagen y la agranda (para leer la barra del navegador)
async function recorteBarra(imagen, porcentaje, escala) {
  const buffer = Buffer.from(imagen.split(",")[1], "base64");
  const meta = await sharp(buffer).metadata();
  const salida = await sharp(buffer)
    .extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * porcentaje) })
    .resize({ width: meta.width * escala })
    .png()
    .toBuffer();
  return `data:image/png;base64,${salida.toString("base64")}`;
}

// Convierte un archivo subido (bytes) en data URL, reducido a 2200 px como hacía la página
export async function bufferADataUrl(buffer) {
  const salida = await sharp(buffer)
    .rotate()
    .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${salida.toString("base64")}`;
}

// ---------- Lectura completa con UN modelo ----------

export async function leerCaptura(modelo, imagen) {
  // Dos lecturas de los enlaces con preguntas distintas. La A es obligatoria.
  const [textoA, textoB] = await Promise.all([
    llamar(modelo, imagen, INSTRUCCION, 1500),
    llamar(modelo, imagen, PREGUNTA_ENLACES, 600).catch(() => null),
  ]);

  const a = leerJson(textoA);
  if (!a) throw new Error("El modelo no devolvió JSON válido");
  const b = textoB ? leerJson(textoB) : null;

  const tipo = TIPOS.includes(a.tipo) ? a.tipo : "otro";
  const esWeb = tipo === "pagina_web";

  // Enlaces: solo es "confirmado" lo que aparece en las dos lecturas
  const enlacesA = listaDeEnlaces(a.enlaces);
  const enlacesB = b ? listaDeEnlaces(b.enlaces) : [];
  const nA = new Set(enlacesA.map(norm));
  const nB = new Set(enlacesB.map(norm));
  const confirmados = enlacesA.filter((u) => nB.has(norm(u)));
  const dudosos = [
    ...new Set([
      ...enlacesA.filter((u) => !nB.has(norm(u))),
      ...enlacesB.filter((u) => !nA.has(norm(u))),
    ]),
  ];

  // Remitente (mensajes y correos) o barra de direcciones (páginas web)
  let remitente = null;
  let barra = null;

  if (esWeb) {
    const [r1, r2] = await Promise.all([
      recorteBarra(imagen, 0.12, 2).then((c) => llamar(modelo, c, PREGUNTA_BARRA, 150)).catch(() => null),
      recorteBarra(imagen, 0.18, 3).then((c) => llamar(modelo, c, PREGUNTA_BARRA, 150)).catch(() => null),
    ]);
    const l1 = limpiarUrl(String(r1 ?? "").split("\n")[0]);
    const l2 = limpiarUrl(String(r2 ?? "").split("\n")[0]);
    const valida = (l) => l && !/^ningun/i.test(l) && l.includes(".");
    // Se compara solo el dominio: la ruta suele estar cortada por la barra
    const coincide = valida(l1) && valida(l2) && host(l1) === host(l2);
    barra = { estado: coincide ? "confirmada" : "dudosa", dominio: coincide ? host(l1) : null };
  } else {
    const bruto = await llamar(modelo, imagen, PREGUNTA_REMITENTE, 200).catch(() => null);
    remitente = validarRemitente(bruto, a.mensaje);
  }

  return {
    tipo,
    marca: a.marca_mencionada ?? null,
    mensaje: a.mensaje ?? null,
    que_se_pide: a.que_se_pide ?? null,
    remitente,
    barra,
    enlaces: { confirmados, dudosos, verificados: b !== null },
    // Lo que irá a la "lupa" (expandir enlace, dominio real, antigüedad)
    para_revisar: esWeb ? (barra.dominio ? [barra.dominio] : []) : confirmados,
  };
}

// Prueba los modelos en orden hasta que uno responda
export async function leerConRespaldo(imagen) {
  const errores = [];
  for (const modelo of MODELOS_VISION) {
    try {
      const lectura = await leerCaptura(modelo, imagen);
      return { lectura, modelo };
    } catch (e) {
      const detalle = `${modelo}: ${e.message}`;
      errores.push(detalle);
      console.error(detalle);
    }
  }
  const err = new Error("Ningún modelo de visión respondió");
  err.detalle = errores;
  throw err;
}
