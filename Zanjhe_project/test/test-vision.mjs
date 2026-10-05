import { readFileSync } from "node:fs";

const MODEL = process.argv[2] || "L";
const imagen = readFileSync("captura.png").toString("base64");

const instruccion = `Eres un lector de capturas de pantalla. Transcribe, no interpretes.
Devuelve SOLO un objeto JSON, sin texto antes ni después, con estas claves:
- "mensaje": el texto del mensaje, copiado tal cual, sin añadir tildes ni corregir.
- "enlaces": lista de URLs o dominios, copiados letra por letra.
- "que_se_pide": en una frase, qué le piden hacer a la persona.
No expliques tu razonamiento.`;

const inicio = Date.now();

const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
  },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0.1,
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruccion },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imagen}` } },
        ],
      },
    ],
  }),
});

const data = await res.json();
console.log("Modelo:", MODEL);
console.log("Segundos:", (Date.now() - inicio) / 1000);

if (data.error) {
  console.log("ERROR:", data.error.code, "-", data.error.message);
} else {
  const choice = data.choices[0];
  console.log("Terminó por:", choice.finish_reason);
  console.log("Tokens usados:", data.usage.completion_tokens);

  const texto = choice.message.content || "";
  console.log("--- Respuesta cruda ---");
  console.log(texto);

  try {
    const limpio = texto.replace(/```json|```/g, "").trim();
    console.log("--- JSON válido ---");
    console.log(JSON.parse(limpio));
  } catch {
    console.log("--- No es JSON válido ---");
  }
}