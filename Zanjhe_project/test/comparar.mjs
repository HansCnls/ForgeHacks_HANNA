import { readFileSync } from "node:fs";

const modelos = process.argv.slice(2);

const INSTRUCCION = `Eres un lector de capturas de pantalla de mensajes. Transcribe, no interpretes.
Devuelve SOLO un objeto JSON, sin texto antes ni después, con EXACTAMENTE estas 4 claves (si un dato no se ve, pon null; nunca omitas una clave):
- "mensaje": solo el texto de la burbuja del mensaje, copiado tal cual y en una sola línea. No incluyas la hora, la fecha ni etiquetas como el nombre del operador o de la SIM. No corrijas ni añadas tildes. Si hay varios mensajes, copia todos separados por " | ".
- "remitente": quién envía el mensaje, tal como aparece en la parte SUPERIOR de la pantalla (número de teléfono o nombre del contacto). Si no aparece ahí, pon null. No uses el nombre del operador ni la hora.
- "enlaces": lista de URLs completas, copiadas letra por letra. Si una URL se parte en dos líneas, únela sin espacios e incluye todo lo que va después de la última barra.
- "que_se_pide": en una frase, qué le piden hacer a la persona. Si no piden nada, pon null.
No expliques tu razonamiento.`;

// Lo que DEBERÍA salir en cada imagen (null = no hay remitente visible)
const esperado = {
  "captura.png":  { remitente: "996906224",  enlace: "bit.ly/Valida-DatosBCP" },
  "captura2.png": { remitente: null,         enlace: "t.ly/cancelar" },
  "captura3.png": { remitente: "RAPPI",      enlace: "rappi.app.link/Ein6PQnEu3" },
  "captura4.png": { remitente: "9726665699", enlace: "appleid.987bf2.com" },
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const tabla = [];

for (const modelo of modelos) {
  for (const [archivo, esp] of Object.entries(esperado)) {
    const fila = { modelo: modelo.split("/")[1].slice(0, 20), imagen: archivo };
    const inicio = Date.now();
    try {
      const imagen = readFileSync(archivo).toString("base64");
      const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          max_tokens: 3000,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: INSTRUCCION },
              { type: "image_url", image_url: { url: `data:image/png;base64,${imagen}` } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      fila.seg = ((Date.now() - inicio) / 1000).toFixed(1);

      if (data.error) {
        fila.error = data.error.message.slice(0, 40);
      } else {
        const choice = data.choices[0];
        fila.termino = choice.finish_reason;
        const texto = (choice.message.content || "").replace(/```json|```/g, "").trim();
        try {
          const j = JSON.parse(texto);
          fila.claves_ok = ["mensaje", "remitente", "enlaces", "que_se_pide"].every((k) => k in j);
          fila.remitente_ok = esp.remitente === null
            ? !j.remitente
            : norm(j.remitente).includes(norm(esp.remitente));
          fila.enlace_ok = norm(JSON.stringify(j.enlaces)).includes(norm(esp.enlace));
        } catch {
          fila.json = "NO";
        }
      }
    } catch (e) {
      fila.error = e.message.slice(0, 40);
    }
    tabla.push(fila);
  }
}

console.table(tabla);