import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

// Tipografía diseñada por el Braille Institute para personas con baja visión
const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata = {
  title: "Guardián",
  description: "Revisa mensajes, correos y páginas sospechosas antes de actuar.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${atkinson.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
