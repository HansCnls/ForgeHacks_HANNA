const res = await fetch("https://api.featherless.ai/v1/models?modalities=vision", {
  headers: { Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}` },
});
const data = await res.json();
const lista = data.data ?? data;

console.log("Total de modelos de visión:", lista.length);
console.log("Ejemplo del primero (para ver qué datos trae):");
console.log(JSON.stringify(lista[0], null, 2));

const modificados = /uncensored|abliterated|heretic|nsfw|darkidol|lewd|erotic|aeon|distill|ultimate/i;
const descartados = /Agents-A1-4B|AEON-7/i;

console.log("\nCandidatos sin variantes modificadas:");
for (const m of lista) {
  if (!modificados.test(m.id) && !descartados.test(m.id)) console.log(m.id);
}