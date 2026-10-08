import { readFileSync } from "node:fs";

const imagen = readFileSync("captura.png").toString("base64");
const modelos = process.argv.slice(2);

const INSTRUCCION = `Eres un lector de capturas de pantalla. Transcribe, no interpretes.
Devuelve SOLO un objeto JSON, sin texto antes ni después, con estas claves:
- "mensaje": el texto del mensaje, copiado tal cual, sin añadir tildes ni corregir.
- "remitente": el número o nombre que aparece en la barra superior de la conversación. NO uses la etiqueta del operador o de la SIM que aparece junto a la hora.
- "enlaces": lista de URLs o dominios, copiados letra por letra.
- "que_se_pide": en una frase, qué le piden hacer a la persona.
No expliques tu razonamiento.`;

const tabla = [];

for (const modelo of modelos) {
  const fila = { modelo };
  const inicio = Date.now();
  try {
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
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: INSTRUCCION },
              { type: "image_url", image_url: { url: `data:image/png;base64,${imagen}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    fila.segundos = ((Date.now() - inicio) / 1000).toFixed(1);

    if (data.error) {
      fila.resultado = "ERROR: " + data.error.message.slice(0, 50);
    } else {
      const choice = data.choices[0];
      fila.termino = choice.finish_reason;
      const texto = (choice.message.content || "").replace(/```json|```/g, "").trim();
      try {
        const j = JSON.parse(texto);
        fila.json = "sí";
        fila.remitente_ok = String(j.remitente).includes("996906224");
        fila.enlace_ok = JSON.stringify(j.enlaces).includes("bit.ly/Valida-DatosBCP");
      } catch {
        fila.json = "NO";
      }
    }
  } catch (e) {
    fila.resultado = "FALLO: " + e.message.slice(0, 50);
  }
  tabla.push(fila);
}

console.table(tabla);