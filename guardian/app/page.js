"use client";
import { useState } from "react";

function reducir(file, max = 2200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * escala;
      c.height = img.height * escala;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = URL.createObjectURL(file);
  });
}

const ESTILO = {
  rojo: { fondo: "bg-red-700", borde: "border-red-700", palabra: "PELIGRO", texto: "text-white" },
  amarillo: { fondo: "bg-amber-400", borde: "border-amber-400", palabra: "CUIDADO", texto: "text-slate-900" },
  verde: { fondo: "bg-green-700", borde: "border-green-700", palabra: "SIN ALERTAS", texto: "text-white" },
};

// Semáforo dibujado: tres luces, solo se enciende la del nivel
function Semaforo({ nivel }) {
  const luz = (n, color) =>
    `w-10 h-10 rounded-full border-2 border-white/60 ${nivel === n ? color : "bg-black/25"}`;
  return (
    <div className="inline-flex gap-3 bg-slate-900 rounded-full px-4 py-3">
      <span className={luz("rojo", "bg-red-500")} />
      <span className={luz("amarillo", "bg-amber-300")} />
      <span className={luz("verde", "bg-green-500")} />
    </div>
  );
}

const TIPO_TEXTO = {
  sms_chat: "un mensaje (SMS o chat)",
  correo: "un correo electrónico",
  pagina_web: "una página web",
  otro: "una captura",
};

// Rastro: lo que el servidor realmente hizo, paso a paso
function construirRastro(r) {
  const pasos = [];
  pasos.push(`Leí la captura: es ${TIPO_TEXTO[r.tipo] || "una captura"}.`);
  if (r.marca) pasos.push(`Dice ser de: ${r.marca}.`);
  if (r.remitente) pasos.push(`Lo envía: ${r.remitente}.`);
  if (r.barra) {
    pasos.push(
      r.barra.estado === "confirmada"
        ? `Leí dos veces la barra del navegador: ${r.barra.dominio}.`
        : "No pude leer con seguridad la barra del navegador."
    );
  }
  const conf = r.enlaces?.confirmados || [];
  if (r.tipo !== "pagina_web") {
    pasos.push(
      conf.length
        ? `Encontré ${conf.length} enlace(s), confirmados con dos lecturas: ${conf.join(", ")}.`
        : "No encontré enlaces escritos que pudiera confirmar."
    );
  }
  for (const inv of r.investigacion || []) {
    for (const h of inv.hallazgos || []) pasos.push(h);
  }
  return pasos;
}

function textoParaFamilia(r) {
  const v = r.veredicto;
  const lineas = [
    `Revisé con Guardián un mensaje sospechoso que me llegó.`,
    `Resultado: ${ESTILO[v.semaforo].palabra} - ${v.titular}`,
    r.marca ? `Dice ser de: ${r.marca}` : null,
    r.remitente ? `Lo envía: ${r.remitente}` : null,
    `Motivos:`,
    ...v.motivos.map((m) => `- ${m}`),
    ``,
    `¿Me ayudas a verificarlo antes de hacer algo?`,
  ];
  return lineas.filter((l) => l !== null).join("\n");
}

function leerEnVoz(r) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const v = r.veredicto;
  const texto = [
    `${ESTILO[v.semaforo].palabra}. ${v.titular}`,
    ...v.motivos,
    v.analogia,
    "Qué hacer ahora:",
    ...v.que_hacer,
  ].join(". ");
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-PE";
  u.rate = 0.9;
  const voz = window.speechSynthesis.getVoices().find((x) => x.lang?.startsWith("es"));
  if (voz) u.voice = voz;
  window.speechSynthesis.speak(u);
}

function Resultado({ r }) {
  const [verRastro, setVerRastro] = useState(false);
  const [verTecnico, setVerTecnico] = useState(false);
  const v = r.veredicto;

  if (!v) {
    return (
      <pre className="w-full max-w-xl text-base whitespace-pre-wrap bg-white p-4 rounded-xl shadow">
        {JSON.stringify(r, null, 2)}
      </pre>
    );
  }

  const e = ESTILO[v.semaforo] || ESTILO.amarillo;
  const rastro = construirRastro(r);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(textoParaFamilia(r))}`;

  return (
    <div className="w-full max-w-xl flex flex-col gap-5">
      {/* Semáforo */}
      <div className={`${e.fondo} ${e.texto} rounded-3xl p-6 text-center shadow-lg`}>
        <Semaforo nivel={v.semaforo} />
        <div className="text-4xl font-bold mt-4 tracking-wide">{e.palabra}</div>
        <div className="text-2xl mt-2">{v.titular}</div>
      </div>

      <button
        onClick={() => leerEnVoz(r)}
        className="py-4 rounded-2xl bg-slate-800 text-white text-2xl font-bold"
      >
        Escuchar el resultado
      </button>

      {/* Motivos */}
      <section className={`bg-white rounded-2xl p-5 shadow border-l-8 ${e.borde}`}>
        <h2 className="text-2xl font-bold mb-3">¿Por qué?</h2>
        <ul className="flex flex-col gap-2 text-xl list-disc pl-6">
          {v.motivos.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
        <p className="mt-4 text-xl italic text-slate-700">{v.analogia}</p>
      </section>

      {/* Qué hacer */}
      <section className="bg-white rounded-2xl p-5 shadow">
        <h2 className="text-2xl font-bold mb-3">¿Qué hago ahora?</h2>
        <ol className="flex flex-col gap-3 text-xl list-decimal pl-6">
          {v.que_hacer.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </section>

      {/* Familia */}
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="py-5 rounded-2xl bg-green-700 text-white text-2xl font-bold text-center"
      >
        Avisar a mi familia por WhatsApp
      </a>

      {/* Rastro real */}
      <section className="bg-white rounded-2xl p-5 shadow">
        <button onClick={() => setVerRastro(!verRastro)} className="text-xl font-bold w-full text-left">
          {verRastro ? "Ocultar" : "Ver"} lo que revisé ({rastro.length} pasos)
        </button>
        {verRastro && (
          <ol className="mt-3 flex flex-col gap-2 text-lg list-decimal pl-6 text-slate-700">
            {rastro.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        )}
      </section>

      <button onClick={() => setVerTecnico(!verTecnico)} className="text-base text-slate-500 underline">
        {verTecnico ? "Ocultar" : "Ver"} detalles técnicos
      </button>
      {verTecnico && (
        <pre className="text-xs whitespace-pre-wrap bg-slate-100 p-3 rounded-xl overflow-auto">
          {JSON.stringify(r, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function Home() {
  const [estado, setEstado] = useState("inicio");
  const [resultado, setResultado] = useState(null);

  async function revisar(e) {
    const file = e.target.files[0];
    if (!file) return;
    setEstado("investigando");
    try {
      const imagen = await reducir(file);
      const res = await fetch("/api/analizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagen }),
      });
      const datos = await res.json();
      setResultado(datos);
      setEstado(res.ok ? "listo" : "error");
    } catch (err) {
      setResultado({ error: String(err) });
      setEstado("error");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-background text-slate-900">
      <h1 className="text-4xl font-bold">Guardián</h1>

      {estado === "inicio" && (
        <>
          <p className="text-xl text-center max-w-md text-slate-600">
            ¿Te llegó un mensaje, correo o página que te parece raro? Sube una captura y lo revisamos juntos.
          </p>
          <label className="w-full max-w-md py-12 rounded-3xl bg-blue-800 text-white text-3xl font-bold text-center cursor-pointer">
            Revisar algo sospechoso
            <input type="file" accept="image/*" onChange={revisar} className="hidden" />
          </label>
        </>
      )}

      {estado === "investigando" && (
        <div className="text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-full border-4 border-slate-300 border-t-blue-800 animate-spin" />
          <p className="text-2xl mt-6">Estoy revisando esto contigo...</p>
          <p className="text-lg text-slate-500 mt-2">Leo la captura, reviso los enlaces y te explico. Puede tardar hasta un minuto.</p>
        </div>
      )}

      {estado === "listo" && <Resultado r={resultado} />}

      {estado === "error" && (
        <div className="text-center">
          <p className="text-2xl text-red-700">No pude revisarlo. Inténtalo de nuevo.</p>
          <p className="mt-2 text-base text-slate-500">{resultado?.error}</p>
        </div>
      )}

      {(estado === "listo" || estado === "error") && (
        <button
          onClick={() => {
            window.speechSynthesis?.cancel();
            setEstado("inicio");
          }}
          className="text-xl underline"
        >
          Revisar otra captura
        </button>
      )}

      <p className="text-sm text-slate-500 text-center max-w-md">
        Privacidad: la captura se procesa solo para este análisis y no se guarda. Guardián no visita los
        enlaces sospechosos; solo consulta registros públicos.
      </p>
    </main>
  );
}
