import { readFileSync } from "node:fs";
import sharp from "sharp";

const modelo = process.argv[2] || "bakrianoo/arabic-legal-documents-ocr-1.0";

const INSTRUCCION = `Eres un lector de capturas de pantalla. Transcribe, no interpretes.
Devuelve SOLO un objeto JSON, sin texto antes ni después, con EXACTAMENTE estas claves (si un dato no se ve, pon null; nunca omitas una clave):
- "tipo": "sms_chat" si es una conversación de mensajes (SMS, WhatsApp, etc.), "correo" si es un correo electrónico, "pagina_web" si es una página web en un navegador, u "otro".
- "url_visible": si hay una barra de direcciones de navegador visible, la dirección que muestra, copiada letra por letra (aunque esté cortada). Si no hay barra de direcciones, null.
- "marca_mencionada": el nombre de la empresa, banco o servicio que el mensaje, correo o página dice ser (por su logo o su texto). Si no menciona ninguno, null.
- "mensaje": el texto principal del mensaje, correo o página, copiado tal cual y en una sola línea. No incluyas la hora, la fecha ni etiquetas del operador o de la SIM. Si hay varios mensajes, sepáralos con " | ".
- "enlaces": lista de direcciones web que se VEAN escritas en la imagen, copiadas letra por letra. Si una dirección se parte en dos líneas, únela sin espacios. No inventes direcciones: si un botón o texto subrayado no muestra su dirección, no lo incluyas.
- "que_se_pide": en una frase, qué le piden hacer a la persona. Si no piden nada, null.
No expliques tu razonamiento.`;

const PREGUNTA_REMITENTE =
  "Esta es una captura de pantalla de una conversación de mensajes o de un correo. ¿Quién lo envía? Busca el número de teléfono, el nombre del contacto o la dirección de correo del remitente en CUALQUIER parte de la pantalla. No uses la hora, la fecha, el nombre del operador o de la SIM, ni contadores de mensajes sin leer (un número dentro de un círculo o globo). No uses texto que esté dentro del propio mensaje. Responde SOLO con ese dato, tal como se ve. Si no se ve ninguno, responde: NINGUNO.";

async function llamar(buffer, texto, maxTokens) {
  const b64 = buffer.toString("base64");
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
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message.slice(0, 60));
  return (data.choices[0].message.content || "").trim();
}

function leerJson(texto) {
  try {
    return JSON.parse(texto.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

// Regla de código: si el "remitente" aparece dentro del texto del mensaje,
// el modelo lo copió del mensaje y no de la cabecera: se descarta.
function validarRemitente(remitente, mensaje) {
  const r = String(remitente ?? "").trim();
  if (!r || /^ninguno$/i.test(r)) return null;
  if (String(mensaje ?? "").toLowerCase().includes(r.toLowerCase())) return null;
  return r;
}

const cortar = (v, n = 38) => (v == null ? null : String(v).slice(0, n));

async function sinCabecera(archivo) {
  const original = readFileSync(archivo);
  const meta = await sharp(original).metadata();
  const corte = Math.round(meta.height * 0.2);
  return sharp(original)
    .extract({ left: 0, top: corte, width: meta.width, height: meta.height - corte })
    .png()
    .toBuffer();
}

const casos = [
  ...["captura.png", "captura2.png", "captura3.png", "captura4.png", "captura5.png", "captura6.png"].map(
    (f) => ({ nombre: f, buffer: readFileSync(f) })
  ),
  { nombre: "captura.png SIN cabecera", buffer: await sinCabecera("captura.png") },
];

const tabla = [];
for (const caso of casos) {
  try {
    const contenido = leerJson(await llamar(caso.buffer, INSTRUCCION, 1500));
    if (!contenido) {
      tabla.push({ imagen: caso.nombre, tipo: "JSON NO VALIDO" });
      continue;
    }
    let remitente = null;
    if (contenido.tipo !== "pagina_web") {
      const bruto = await llamar(caso.buffer, PREGUNTA_REMITENTE, 200);
      remitente = validarRemitente(bruto, contenido.mensaje);
    }
    tabla.push({
      imagen: caso.nombre,
      tipo: contenido.tipo,
      remitente: cortar(remitente),
      url_visible: cortar(contenido.url_visible),
      marca: cortar(contenido.marca_mencionada, 20),
      enlaces: cortar(JSON.stringify(contenido.enlaces), 40),
    });
  } catch (e) {
    tabla.push({ imagen: caso.nombre, tipo: "ERROR: " + e.message });
  }
}

console.table(tabla);