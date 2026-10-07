export const maxDuration = 60;

const INSTRUCCION = `Eres un lector de capturas de pantalla. Transcribe, no interpretes.
Devuelve SOLO un objeto JSON, sin texto antes ni después, con estas claves:
- "mensaje": el texto del mensaje, copiado tal cual, sin añadir tildes ni corregir.
- "remitente": el número o nombre que aparece en la barra superior de la conversación. NO uses la etiqueta del operador o de la SIM que aparece junto a la hora.
- "enlaces": lista de URLs o dominios, copiados letra por letra.
- "que_se_pide": en una frase, qué le piden hacer a la persona.
No expliques tu razonamiento.`;

export async function POST(request) {
  const { imagen } = await request.json();
  if (!imagen) {
    return Response.json({ error: "Falta la imagen" }, { status: 400 });
  }

  const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
    },
    body: JSON.stringify({
      model: "autotrust/JEV-27B-VL",
      temperature: 0.1,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCCION },
            { type: "image_url", image_url: { url: imagen } },
          ],
        },
      ],
    }),
  });

  const data = await res.json();

  if (data.error) {
    return Response.json({ error: data.error.message }, { status: 502 });
  }

  const choice = data.choices[0];
  if (choice.finish_reason === "length") {
    return Response.json({ error: "La respuesta se cortó" }, { status: 502 });
  }

  try {
    const limpio = (choice.message.content || "")
      .replace(/```json|```/g, "")
      .trim();
    return Response.json(JSON.parse(limpio));
  } catch {
    return Response.json({ error: "El modelo no devolvió JSON válido" }, { status: 502 });
  }
}