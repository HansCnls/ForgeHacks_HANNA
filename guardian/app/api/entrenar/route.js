import { NextResponse } from "next/server";
import { generarEscenario } from "../../../lib/entrenador.mjs";

export async function GET() {
  try {
    const escenario = await generarEscenario();
    return NextResponse.json(escenario);
  } catch (error) {
    console.error("Error en entrenador:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
