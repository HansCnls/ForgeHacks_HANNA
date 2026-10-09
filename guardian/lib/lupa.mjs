// "La lupa": comprueba HECHOS sobre un enlace. No usa IA.
// No visita el sitio sospechoso: solo consulta al acortador (si lo hay) y al registro de dominios.

const ACORTADORES = new Set([
  "bit.ly", "t.ly", "tinyurl.com", "cutt.ly", "is.gd", "v.gd", "rb.gy", "ow.ly", "goo.gl",
  "shorturl.at", "rebrand.ly", "t.co", "lnkd.in", "buff.ly", "tiny.cc", "bit.do", "s.id",
]);

// Finales de dominio baratos, muy usados en sitios desechables. Es solo una pista débil.
const TLD_SOSPECHOSOS = new Set(["top", "xyz", "click", "icu", "buzz", "monster", "cyou", "sbs", "cfd", "rest"]);

// Sitios oficiales. SOLO agregar tras verificar en la web oficial de cada marca.
// Verificados: BCP (viabcp.com) e Interbank (interbank.pe).
// De conocimiento general, a confirmar: Apple y SUNAT.
export const MARCAS = [
  { nombre: "BCP", alias: ["bcp", "viabcp", "banco de crédito", "banco de credito"], oficiales: ["viabcp.com"] },
  { nombre: "Interbank", alias: ["interbank"], oficiales: ["interbank.pe"] },
  { nombre: "Apple", alias: ["apple", "icloud"], oficiales: ["apple.com", "icloud.com"] },
  { nombre: "SUNAT", alias: ["sunat"], oficiales: ["sunat.gob.pe"] },
  // PENDIENTE (verificar cada dominio oficial): BBVA, Scotiabank, Yape, Plin, Entel, Claro, Movistar, Rappi
];

// ---------- Utilidades ----------

function esDireccionInterna(h) {
  h = h.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.startsWith("[")) return true;
  return false;
}

function aURL(texto) {
  try {
    const t = String(texto).trim();
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `http://${t}`);
  } catch {
    return null;
  }
}

// Saca el dominio "real" (el que se compra) y lo que va antes (subdominio).
// Aproximación: reconoce finales dobles comunes como com.pe, gob.pe, co.uk
export function analizarHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(host)) {
    return { host, dominio: host, subdominio: "", tld: "", esIp: true };
  }
  const et = host.split(".");
  const doble =
    et.length >= 3 && /^(com|org|net|gob|edu|co|gov|mil|ac)\.[a-z]{2}$/.test(et.slice(-2).join("."));
  const n = Math.min(doble ? 3 : 2, et.length);
  return {
    host,
    dominio: et.slice(-n).join("."),
    subdominio: et.slice(0, -n).join("."),
    tld: et[et.length - 1],
    esIp: false,
  };
}

function buscarMarca(marcaTexto, host) {
  const t = String(marcaTexto ?? "").toLowerCase();
  if (t) {
    const m = MARCAS.find((x) => x.alias.some((a) => t.includes(a)));
    if (m) return m;
  }
  const etiquetas = host.split(/[.\-]/);
  return MARCAS.find((x) =>
    x.alias.some((a) => {
      const alias = a.replace(/\s/g, "");
      return etiquetas.some((e) => e === alias || (alias.length >= 5 && e.startsWith(alias)));
    })
  );
}

// ---------- Herramienta 1: expandir enlaces acortados ----------
// Solo pide datos a los acortadores. Cuando el destino ya no es un acortador, se detiene sin visitarlo.

async function pedir(url, metodo) {
  return fetch(url, { method: metodo, redirect: "manual", signal: AbortSignal.timeout(5000) });
}

async function expandir(urlInicial) {
  let actual = urlInicial;
  const cadena = [actual.href];

  for (let i = 0; i < 4; i++) {
    const h = analizarHost(actual.hostname);
    if (!ACORTADORES.has(h.dominio)) break;
    if (!["http:", "https:"].includes(actual.protocol) || esDireccionInterna(actual.hostname)) {
      return { ok: false, error: "dirección no permitida", cadena };
    }
    let res;
    try {
      res = await pedir(actual.href, "HEAD");
      if (res.status === 405 || res.status === 501) {
        res = await pedir(actual.href, "GET");
        res.body?.cancel();
      }
    } catch {
      return { ok: false, error: "el acortador no respondió", cadena };
    }
    const destino = res.headers.get("location");
    if (!(res.status >= 300 && res.status < 400 && destino)) {
      return { ok: false, error: "el acortador no mostró el destino", cadena };
    }
    try {
      actual = new URL(destino, actual);
    } catch {
      return { ok: false, error: "destino inválido", cadena };
    }
    cadena.push(actual.href);
  }

  if (ACORTADORES.has(analizarHost(actual.hostname).dominio)) {
    return { ok: false, error: "demasiadas redirecciones", cadena };
  }
  return { ok: true, final: actual.href, saltos: cadena.length - 1, cadena };
}

// ---------- Herramienta 2: antigüedad del dominio (RDAP) ----------
// No todos los finales de dominio publican la fecha. Si falta, se dice; no se inventa.

async function edadDominio(dominio) {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(dominio)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { disponible: false };
    const data = await res.json();
    const ev = (data.events || []).find((e) => e.eventAction === "registration");
    if (!ev?.eventDate) return { disponible: false };
    const fecha = new Date(ev.eventDate);
    if (isNaN(fecha.getTime())) return { disponible: false };
    const dias = Math.floor((Date.now() - fecha.getTime()) / 86400000);
    return { disponible: true, fecha: fecha.toISOString().slice(0, 10), dias };
  } catch {
    return { disponible: false };
  }
}

// ---------- Investigar un enlace ----------

async function investigarUno(entrada, marcaTexto) {
  const hallazgos = [];
  const resultado = { entrada, hallazgos };

  let url = aURL(entrada);
  if (!url) {
    hallazgos.push("Lo que se leyó no parece una dirección web válida.");
    return resultado;
  }
  let host = analizarHost(url.hostname);

  // 1. ¿Es un enlace acortado?
  if (ACORTADORES.has(host.dominio)) {
    resultado.acortador = host.dominio;
    hallazgos.push(`Es un enlace acortado (${host.dominio}): esconde a dónde lleva.`);
    const exp = await expandir(url);
    resultado.expansion = exp;
    if (!exp.ok) {
      hallazgos.push(`No pude ver a dónde lleva (${exp.error}).`);
      resultado.dominio = host.dominio;
      return resultado;
    }
    url = new URL(exp.final);
    host = analizarHost(url.hostname);
    hallazgos.push(`Al seguirlo, lleva a: ${host.host}`);
  }

  resultado.host = host.host;
  resultado.dominio = host.dominio;
  resultado.subdominio = host.subdominio;

  // 2. Dominio real
  if (host.esIp) {
    resultado.es_ip = true;
    hallazgos.push("La dirección usa solo números en vez de un nombre, algo raro en sitios de empresas.");
  } else if (host.subdominio) {
    hallazgos.push(
      `El sitio real es ${host.dominio}. Lo que va antes ("${host.subdominio}") lo puede escribir cualquiera.`
    );
  } else {
    hallazgos.push(`El sitio es ${host.dominio}.`);
  }

  // 3. Marca que dice ser contra sitio oficial
  const marca = buscarMarca(marcaTexto, host.host);
  if (marca) {
    const oficial = marca.oficiales.includes(host.dominio);
    resultado.marca = { nombre: marca.nombre, coincide_oficial: oficial, oficiales: marca.oficiales };
    hallazgos.push(
      oficial
        ? `Coincide con el sitio oficial de ${marca.nombre}.`
        : `NO coincide con el sitio oficial de ${marca.nombre} (${marca.oficiales.join(" o ")}).`
    );
  } else if (marcaTexto) {
    hallazgos.push(`El mensaje dice ser de ${marcaTexto}, pero no tengo registrado su sitio oficial para comparar.`);
  }

  // 4. Final de dominio
  if (TLD_SOSPECHOSOS.has(host.tld)) {
    resultado.tld_sospechoso = true;
    hallazgos.push(`Termina en .${host.tld}, un final barato muy usado en sitios desechables. Es solo una pista.`);
  }

  // 5. Antigüedad del dominio
  if (!host.esIp) {
    const edad = await edadDominio(host.dominio);
    resultado.edad = edad;
    if (edad.disponible) {
      hallazgos.push(
        edad.dias < 90
          ? `El sitio se creó hace solo ${edad.dias} días: es muy nuevo.`
          : `El sitio se creó hace ${edad.dias} días (${edad.fecha}).`
      );
    } else {
      hallazgos.push("No pude averiguar cuándo se creó el sitio (no todos los registros lo informan).");
    }
  }

  return resultado;
}

function conTiempo(promesa, ms, entrada) {
  const limite = new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          entrada,
          hallazgos: ["La revisión de este enlace tardó demasiado y no pude completarla."],
        }),
      ms
    )
  );
  return Promise.race([promesa, limite]);
}

export async function investigar(enlaces, marcaTexto) {
  const unicos = [...new Set((enlaces || []).map(String))].slice(0, 3);
  return Promise.all(
    unicos.map((e) =>
      conTiempo(
        investigarUno(e, marcaTexto).catch(() => ({
          entrada: e,
          hallazgos: ["No pude revisar este enlace."],
        })),
        10000,
        e
      )
    )
  );
}
