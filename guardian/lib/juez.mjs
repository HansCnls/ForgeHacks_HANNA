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
    re: /urgent|inmediat|hoy mismo|24 ?h|48 ?h|últim[oa] aviso|ultimo aviso|expira|vence|caduca|bloquead|suspendid|desactivad|restringid|immediately|suspended|locked|final notice|expire/i,
    peso: 1,
    texto: "Te mete prisa o te amenaza con bloquear algo: es la presión típica de una estafa.",
    en: ["They rush you", "The message pressures you to act fast or threatens to lock something. Scammers use urgency so you don't think twice."],
  },
  {
    id: "datos",
    re: /clave|contraseña|password|token|código de verificación|codigo de verificacion|cvv|pin\b|datos de (tu )?tarjeta|número de tarjeta|numero de tarjeta|actualiza(r)? (tus )?datos|verifica(r)? (tu )?(cuenta|identidad)|card number|verify your (account|identity)|update your (details|information)/i,
    peso: 2,
    texto: "Pide claves, códigos o datos de tarjeta. Los bancos nunca piden eso por mensajes.",
    en: ["Asks for sensitive data", "It asks for passwords, codes or card details. Banks never ask for that by message."],
  },
  {
    id: "dinero",
    re: /transfer|deposit|yape(a|ar)?\b|plin\b|pag(a|ar|o) (pendiente|ahora)|multa|deuda|reembolso|premio|ganaste|ganador|sorteo|\bfee\b|payment|refund|prize|you won/i,
    peso: 1,
    texto: "Habla de dinero, premios, multas o pagos pendientes.",
    en: ["Talks about money", "It mentions payments, fines, refunds or prizes."],
  },
];

export function evaluarReglas(lectura, investigacion) {
  const motivos = [];
  const senales_en = [];
  let puntos = 0;
  let marcaOficial = false;
  const marcar = (pts, es, titulo, detalle) => {
    puntos += pts;
    motivos.push(es);
    senales_en.push({ titulo, detalle });
  };

  for (const inv of investigacion || []) {
    if (inv.marca && inv.marca.coincide_oficial === false) {
      const oficiales = inv.marca.oficiales.join(" o ");
      marcar(
        3,
        `El enlace no es del sitio oficial de ${inv.marca.nombre} (${oficiales}), aunque diga serlo.`,
        "Link doesn't match the company",
        `It says it is ${inv.marca.nombre}, but the real site is "${inv.dominio}", not ${inv.marca.oficiales.join(" or ")}.`
      );
    }
    if (inv.marca && inv.marca.coincide_oficial === true) marcaOficial = true;
    if (inv.edad?.disponible && inv.edad.dias < 90) {
      marcar(2, `El sitio se creó hace solo ${inv.edad.dias} días.`, "Very new website", `The site was created only ${inv.edad.dias} days ago.`);
    }
    if (inv.es_ip) {
      marcar(2, "El enlace usa números en vez de un nombre de sitio.", "Link uses only numbers", "Real companies use a name, not a string of numbers, for their website.");
    }
    if (inv.tld_sospechoso) {
      marcar(
        1,
        `El sitio termina en un final barato muy usado por estafadores (${inv.dominio}).`,
        "Unusual web address",
        `"${inv.dominio}" ends in a cheap extension often used in scams.`
      );
    }
    if (inv.acortador) {
      const expandido = inv.expansion?.ok;
      marcar(
        expandido ? 1 : 2,
        "Usa un enlace acortado que esconde a dónde lleva.",
        "Shortened link",
        expandido
          ? `It hides where it really leads. We followed it: it goes to "${inv.host}".`
          : "It hides where it really leads, and we could not see the final address."
      );
    }
  }

  const texto = `${lectura?.mensaje ?? ""} ${lectura?.que_se_pide ?? ""}`;
  for (const p of PATRONES) {
    if (p.re.test(texto)) marcar(p.peso, p.texto, p.en[0], p.en[1]);
  }

  // Remitente con número extranjero diciendo ser una marca peruana
  const rem = String(lectura?.remitente ?? "");
  if (/^\+/.test(rem.replace(/\s/g, "")) && !/^\+51/.test(rem.replace(/\s/g, "")) && lectura?.marca) {
    marcar(
      1,
      `Dice ser de ${lectura.marca}, pero llega desde un número extranjero (${rem}).`,
      "Sent from a foreign number",
      `It says it is ${lectura.marca}, but it comes from ${rem}.`
    );
  }

  if (marcaOficial && puntos === 0) puntos -= 1;

  const semaforo = puntos >= 3 ? "rojo" : puntos >= 1 ? "amarillo" : "verde";
  return { semaforo, puntos, motivos, senales_en };
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

// ============================================================
// Juez en inglés, con el formato que espera la interfaz (public/index.html):
// { veredicto: "safe"|"suspicious"|"dangerous", resumen, senales: [{titulo, detalle}], acciones: [] }
// ============================================================

const A_INGLES = { verde: "safe", amarillo: "suspicious", rojo: "dangerous" };
const DE_INGLES = { safe: "verde", suspicious: "amarillo", dangerous: "rojo" };

const RESPALDO_EN = {
  dangerous: {
    resumen:
      "This message shows several classic scam signs. It is very likely an attempt to steal your data or money. It is like someone in a fake uniform knocking on your door: it looks real, but it does not come from where it says.",
    acciones: [
      "Do not click any link in the message and do not reply.",
      "Never share passwords, codes or card details.",
      "If you are worried about your account, call the number printed on your card or type the official website yourself.",
      "Block the sender and report the message as spam.",
      "If you already shared data, call your bank right away to block your card.",
    ],
  },
  suspicious: {
    resumen:
      "This message has some warning signs. It is worth confirming with the company before doing anything. It is like a letter without a clear sender: it may be real, but check before opening the door.",
    acciones: [
      "Do not click links or pay through this message yet.",
      "Check directly with the company using its official phone number or website, not the ones in the message.",
      "Ask a family member or someone you trust before doing anything.",
    ],
  },
  safe: {
    resumen:
      "We did not find warning signs in what we could check. That is not a guarantee, but nothing unusual stands out.",
    acciones: [
      "Act on it only if you were expecting this message.",
      "Never share verification codes or passwords with anyone.",
    ],
  },
};

function instruccionJuezEn(lectura, investigacion, reglas) {
  const hechos = {
    type: lectura.tipo,
    company_it_claims_to_be: lectura.marca,
    sender: lectura.remitente,
    message_text: lectura.mensaje,
    what_it_asks_for: lectura.que_se_pide,
    browser_address_bar: lectura.barra,
    links_read: lectura.enlaces,
    link_checks_by_tools: (investigacion || []).map((i) => ({ link: i.entrada, findings_in_spanish: i.hallazgos })),
    rule_signals: reglas.senales_en,
    minimum_level_by_rules: A_INGLES[reglas.semaforo],
  };

  return `You are "HANNA", an assistant that helps older adults recognize digital scams.
Here are FACTS about a suspicious screenshot: what was read in it and what our tools verified about its links.

FACTS (JSON):
${JSON.stringify(hechos, null, 2)}

Rules:
- Base your judgment ONLY on the facts. Do not invent anything that is not above.
- The verdict can NOT be lower than "minimum_level_by_rules" (order: safe < suspicious < dangerous). You may raise it if the text justifies it.
- Write in simple English, short sentences, no jargon (no "phishing", "TLD", "domain": say "website" or "address").
- Address the reader as "you".

Return ONLY a JSON object, with no text before or after, with exactly these keys:
- "veredicto": "safe", "suspicious" or "dangerous".
- "resumen": two short sentences: the verdict in plain words, then an everyday comparison (e.g. a fake uniform, a letter with a fake stamp).
- "senales": list of 2 to 4 objects {"titulo": "short label (max 6 words)", "detalle": "one short sentence with the concrete evidence from the facts"}.
- "acciones": list of 3 to 5 concrete steps in order (what NOT to do, how to verify through another channel, how to report/block, what to do if data was already shared).`;
}

const listaSenales = (x) =>
  Array.isArray(x)
    ? x
        .map((s) =>
          typeof s === "string"
            ? { titulo: s.trim(), detalle: "" }
            : { titulo: String(s?.titulo ?? s?.title ?? "").trim(), detalle: String(s?.detalle ?? s?.detail ?? "").trim() }
        )
        .filter((s) => s.titulo)
        .slice(0, 4)
    : [];

export async function juzgarEn(lectura, investigacion, { hasta = Date.now() + 40000 } = {}) {
  const reglas = evaluarReglas(lectura, investigacion);
  const piso = A_INGLES[reglas.semaforo];
  const prompt = instruccionJuezEn(lectura, investigacion, reglas);
  const errores = [];

  for (const modelo of MODELOS_JUEZ) {
    const restante = hasta - Date.now();
    if (restante < 4000) {
      errores.push("No time left for more AI attempts");
      break;
    }
    try {
      const j = extraerJson(await llamarTexto(modelo, prompt, Math.min(20000, restante)));
      if (!j) throw new Error("No devolvió JSON válido");

      const nivelIA = DE_INGLES[j.veredicto] ? j.veredicto : piso;
      // La IA puede subir el riesgo, nunca bajarlo del piso de reglas
      const nivel = NIVELES[Math.max(NIVELES.indexOf(DE_INGLES[nivelIA]), NIVELES.indexOf(reglas.semaforo))];
      const veredicto = A_INGLES[nivel];
      const base = RESPALDO_EN[veredicto];
      const senales = listaSenales(j.senales);
      const acciones = listaTexto(j.acciones, 5);

      return {
        veredicto,
        resumen: String(j.resumen || "").trim() || base.resumen,
        senales: senales.length ? senales : reglas.senales_en.slice(0, 4),
        acciones: acciones.length >= 2 ? acciones : base.acciones,
        fuente: "ia",
        modelo_juez: modelo,
      };
    } catch (e) {
      const detalle = `${modelo}: ${e.message}`;
      errores.push(detalle);
      console.error("Juez EN " + detalle);
    }
  }

  // Respaldo: solo reglas
  const base = RESPALDO_EN[piso];
  return {
    veredicto: piso,
    resumen: base.resumen,
    senales: reglas.senales_en.length
      ? reglas.senales_en.slice(0, 4)
      : [{ titulo: "No warning signs found", detalle: "Nothing unusual in what we could check." }],
    acciones: base.acciones,
    fuente: "reglas",
    errores_juez: errores,
  };
}
