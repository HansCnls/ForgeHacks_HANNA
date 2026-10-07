"use client";
import { useState } from "react";

function reducir(file, max = 1280) {
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
    } catch {
      setEstado("error");
    }
  }
  
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-slate-50 text-slate-900">
      <h1 className="text-4xl font-bold">Guardián</h1>

      {estado === "inicio" && (
        <label className="w-full max-w-md py-12 rounded-3xl bg-blue-700 text-white text-3xl font-bold text-center cursor-pointer">
          Revisar algo sospechoso
          <input type="file" accept="image/*" onChange={revisar} className="hidden" />
        </label>
      )}

      {estado === "investigando" && (
        <p className="text-2xl text-center">Estoy revisando esto contigo...</p>
      )}

      {estado === "listo" && (
        <pre className="w-full max-w-md text-lg whitespace-pre-wrap bg-white p-4 rounded-xl shadow">
          {JSON.stringify(resultado, null, 2)}
        </pre>
      )}

      {estado === "error" && (
        <p className="text-2xl text-center text-red-700">
          No pude revisarlo. Inténtalo de nuevo.
        </p>
      )}

      {(estado === "listo" || estado === "error") && (
        <button
          onClick={() => setEstado("inicio")}
          className="text-xl underline"
        >
          Revisar otra captura
        </button>
      )}
    </main>
  );
}
