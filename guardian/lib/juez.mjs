// "El juez": combina lo que se LEYÓ (lectura) y lo que se COMPROBÓ (lupa)
// y produce el semáforo, los motivos, una analogía y los pasos a seguir.
//
// Dos capas:
//   1) Reglas (código): un piso de riesgo basado en hechos comprobados. Siempre funciona.
//   2) IA (texto): redacta la explicación en lenguaje simple y puede SUBIR el riesgo
//      (por ejemplo, si el texto pide la clave), pero nunca bajarlo por debajo del piso.
// Si todos los modelos fallan, se entrega el veredicto de reglas con textos de respaldo.

const MODELOS_JUEZ = (process.env.JUEZ_MODELOS ||
  "unsloth/Llama-3.3-70B-Instruct,RedHatAI/Llama-3.3-70B-Instruct,Qwen/Qwen3-14B")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const NIVELES = ["verde", "amarillo", "rojo"];

// ---------- Capa 1: reglas ----------

const PATRONES = [
  {
    id: "urgencia",
    re: /urgent|inmediat|hoy mismo|24 ?h|48 ?h|últim[oa] aviso|ultimo aviso|expira|vence|caduca|bloquead|suspendid|desactivad|restringid/i,
    peso: 1,
    texto: "Te mete prisa o te amenaza con bloquear algo: es la presión típica de una estafa.",
  },
  {
    id: "datos",
    re: /clave|contraseña|password|token|código de verificación|codigo de verificacion|cvv|pin\b|datos de (tu )?tarjeta|número de tarjeta|numero de tarjeta|actualiza(r)? (tus )?datos|verifica(r)? (tu )?(cuenta|identidad)/i,
    peso: 2,
    texto: "Pide claves, códigos o datos de tarjeta. Los bancos nunca piden eso por mensajes.",
  },
  {
    id: "dinero",
    re: /transfer|deposit|yape(a|ar)?\b|plin\b|pag(a|ar|o) (pendiente|ahora)|multa|deuda|reembolso|premio|ganaste|ganador|sorteo/i,
    peso: 1,
    texto: "Habla de dinero, premios, multas o pagos pendientes.",
  },
];

export function evaluarReglas(lectura, investigacion) {
  const motivos = [];
  let puntos = 0;
  let marcaOficial = false;

  for (const inv of investigacion || []) {
    if (inv.marca && inv.marca.coincide_oficial === false) {
      puntos += 3;
      motivos.push(
        `El enlace no es del sitio oficial de ${inv.marca.nombre} (${inv.marca.oficiales.join(" o ")}), aunque diga serlo.`
      );
    }
    if (inv.marca && inv.marca.coincide_oficial === true) marcaOficial = true;
    if (inv.edad?.disponible && inv.edad.dias < 90) {
      puntos += 2;
      motivos.push(`El sitio se creó hace solo ${inv.edad.dias} días.`);
    }
    if (inv.es_ip) {
      puntos += 2;
      motivos.push("El enlace usa números en vez de un nombre de sitio.");
    }
    if (inv.tld_sospechoso) {
      puntos += 1;
      motivos.push(`El sitio termina en un final barato muy usado por estafadores (${inv.dominio}).`);
    }
    if (inv.acortador) {
      puntos += 1;
      motivos.push("Usa un enlace acortado que esconde a dónde lleva.");
      if (inv.expansion && !inv.expansion.ok) puntos += 1;
    }
  }

  const texto = `${lectura?.mensaje ?? ""} ${lectura?.que_se_pide ?? ""}`;
  for (const p of PATRONES) {
    if (p.re.test(texto)) {
      puntos += p.peso;
      motivos.push(p.texto);
    }
  }

  // Remitente con número extranjero diciendo ser una marca peruana
  const rem = String(lectura?.remitente ?? "");
  if (/^\+/.test(rem.replace(/\s/g, "")) && !/^\+51/.test(rem.replace(/\s/g, "")) && lectura?.marca) {
    puntos += 1;
    motivos.push(`Dice ser de ${lectura.marca}, pero llega desde un número extranjero (${rem}).`);
  }

  if (marcaOficial && puntos === 0) puntos -= 1;

  const semaforo = puntos >= 3 ? "rojo" : puntos >= 1 ? "amarillo" : "verde";
  return { semaforo, puntos, motivos };
}

// ---------- Textos de respaldo (si la IA no responde) ----------

const RESPALDO = {
  rojo: {
    titular: "Esto tiene todas las señales de una estafa.",
    analogia:
      "Es como si alguien con un uniforme falso tocara tu puerta diciendo que viene del banco: el uniforme se parece, pero la dirección de donde viene no es la del banco.",
    que_hacer: [
      "No toques el enlace ni respondas el mensaje.",
      "No des claves, códigos ni datos de tarjeta a nadie.",
      "Si te preocupa tu cuenta, llama tú al número que está detrás de tu tarjeta o entra escribiendo tú mismo la dirección oficial.",
      "Bloquea al remitente y reporta el mensaje como spam.",
      "Si ya diste datos, llama a tu banco ahora para bloquear la tarjeta.",
    ],
  },
  amarillo: {
    titular: "Hay señales raras. Mejor verifícalo por otro camino.",
    analogia:
      "Es como recibir una carta sin remitente claro: puede ser real, pero antes de abrir la puerta conviene llamar a quien dice enviarla.",
    que_hacer: [
      "No toques el enlace todavía.",
      "Verifica llamando tú al número oficial de la empresa (no al que viene en el mensaje).",
      "Pregúntale a un familiar o a alguien de confianza antes de hacer nada.",
    ],
  },
  verde: {
    titular: "No encontré señales claras de estafa.",
    analogia:
      "Es como revisar un billete con la lupa y no ver nada raro: no garantiza que sea bueno, pero no hay alertas a la vista.",
    que_hacer: [
      "Aun así, nunca compartas claves ni códigos por mensajes.",
      "Si te piden dinero o datos, verifica por otro canal antes de actuar.",
    ],
  },
};

// ---------- Capa 2: IA ----------

function instruccionJuez(lectura, investigacion, reglas) {
  const hechos = {
    tipo: lectura.tipo,
    marca_que_dice_ser: lectura.marca,
    remitente: lectura.remitente,
    mensaje: lectura.mensaje,
    que_se_pide: lectura.que_se_pide,
    barra_navegador: lectura.barra,
    enlaces_leidos: lectura.enlaces,
    comprobaciones_de_enlaces: (investigacion || []).map((i) => ({ enlace: i.entrada, hallazgos: i.hallazgos })),
    senales_por_reglas: reglas.motivos,
    nivel_minimo_por_reglas: reglas.semaforo,
  };

  return `Eres "Guardián", un asistente que ayuda a adultos mayores de Perú a reconocer estafas digitales.
Te paso HECHOS sobre una captura de pantalla sospechosa: lo que se leyó en ella y lo que se comprobó de sus enlaces con herramientas.

HECHOS (JSON):
${JSON.stringify(hechos, null, 2)}

Reglas:
- Basa tu juicio SOLO en los hechos. No inventes datos que no estén arriba.
- El semáforo NO puede ser más bajo que "nivel_minimo_por_reglas" (orden: verde < amarillo < rojo). Puedes subirlo si el texto lo justifica.
- Habla de "tú", con frases cortas y palabras sencillas, sin tecnicismos (nada de "phishing", "TLD", "dominio": di "sitio" o "dirección").
- La analogía debe ser de la vida cotidiana (ej.: un cobrador con uniforme falso, una carta con sello trucho).

Devuelve SOLO un objeto JSON, sin texto antes ni después, con exactamente estas claves:
- "semaforo": "rojo", "amarillo" o "verde".
- "titular": una frase corta (máximo 12 palabras) con el veredicto.
- "motivos": lista de 2 a 4 frases cortas, cada una con una señal concreta de los hechos.
- "analogia": una frase con una comparación cotidiana.
- "que_hacer": lista de 3 a 5 pasos concretos y en orden (qué NO hacer, cómo verificar por otro canal, cómo reportar/bloquear, y qué hacer si ya dio datos).`;
}

async function llamarTexto(modelo, prompt, ms = 20000) {
  const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.2,
      max_tokens: 900,
      messages: [{ role: "user", content: modelo.includes("Qwen3") ? `${prompt}\n/no_think` : prompt }],
    }),
    signal: AbortSignal.timeout(ms),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || String(data.error));
  const choice = data.choices?.[0];
  if (!choice) throw new Error("Respuesta vacía");
  if (choice.finish_reason === "length") throw new Error("La respuesta se cortó");
  return (choice.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function extraerJson(texto) {
  const limpio = texto.replace(/```json|```/g, "").trim();
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin < ini) return null;
  try {
    return JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    return null;
  }
}

const listaTexto = (x, max) =>
  Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean).slice(0, max) : [];

// ---------- Juez completo ----------

export async function juzgar(lectura, investigacion, { hasta = Date.now() + 40000 } = {}) {
  const reglas = evaluarReglas(lectura, investigacion);
  const prompt = instruccionJuez(lectura, investigacion, reglas);
  const errores = [];

  for (const modelo of MODELOS_JUEZ) {
    const restante = hasta - Date.now();
    if (restante < 4000) {
      errores.push("Sin tiempo para más intentos de IA");
      break;
    }
    try {
      const j = extraerJson(await llamarTexto(modelo, prompt, Math.min(20000, restante)));
      if (!j) throw new Error("No devolvió JSON válido");

      const nivelIA = NIVELES.includes(j.semaforo) ? j.semaforo : reglas.semaforo;
      // La IA puede subir el riesgo, nunca bajarlo del piso de reglas
      const semaforo = NIVELES[Math.max(NIVELES.indexOf(nivelIA), NIVELES.indexOf(reglas.semaforo))];
      const base = RESPALDO[semaforo];
      const motivos = listaTexto(j.motivos, 4);
      const pasos = listaTexto(j.que_hacer, 5);

      return {
        semaforo,
        titular: String(j.titular || "").trim() || base.titular,
        motivos: motivos.length ? motivos : reglas.motivos.slice(0, 4),
        analogia: String(j.analogia || "").trim() || base.analogia,
        que_hacer: pasos.length >= 2 ? pasos : base.que_hacer,
        reglas,
        fuente: "ia",
        modelo_juez: modelo,
        ajustado_por_reglas: semaforo !== nivelIA,
      };
    } catch (e) {
      const detalle = `${modelo}: ${e.message}`;
      errores.push(detalle);
      console.error("Juez " + detalle);
    }
  }

  // Respaldo: solo reglas
  const base = RESPALDO[reglas.semaforo];
  return {
    semaforo: reglas.semaforo,
    titular: base.titular,
    motivos: reglas.motivos.length ? reglas.motivos.slice(0, 4) : ["No encontré señales de alerta en lo que pude revisar."],
    analogia: base.analogia,
    que_hacer: base.que_hacer,
    reglas,
    fuente: "reglas",
    errores_juez: errores,
  };
}
