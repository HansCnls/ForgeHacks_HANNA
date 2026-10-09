export async function generarEscenario() {
  const instruccion = `You are an AI cybersecurity trainer for a hackathon project. 
Generate a random text message (SMS or WhatsApp) scenario that a user might receive.
Make it either a phishing scam (e.g., fake bank, fake package, fake job offer) OR a legitimate message (e.g., real 2FA code, generic safe notification).

You MUST respond ONLY with a JSON object in this exact format, with no extra text before or after:
{
  "sender": "e.g. National Bank, +1 555-0192, Amazon Delivery",
  "message": "The exact text of the message",
  "is_scam": true (if scam) or false (if safe),
  "explanation": "A concise 1-2 sentence explanation of why this is a scam (point out the red flags) or why it is safe."
}`;

  const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
    },
    body: JSON.stringify({
      model: "Qwen/Qwen3-VL-30B-A3B-Instruct",
      temperature: 0.8,
      messages: [{ role: "user", content: instruccion }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  
  if (!res.ok) {
    throw new Error(`Featherless API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices[0]?.message?.content || "";
  
  try {
    return JSON.parse(content.replace(/```json|```/g, "").trim());
  } catch (e) {
    throw new Error("El modelo no devolvió un JSON válido: " + content);
  }
}
