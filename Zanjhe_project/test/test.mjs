const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
  },
  body: JSON.stringify({
    model: "zai-org/GLM-5.2",
    messages: [{ role: "user", content: "Responde solo con la palabra: funciona" }],
    max_tokens: 300,
  }),
});

console.log("Estado:", res.status);
console.log(JSON.stringify(await res.json(), null, 2));