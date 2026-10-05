Modelo de visión principal: autotrust/JEV-27B-VL. Funciona por la API con imágenes en base64

Descartados y por qué: InternScience/Agents-A1-4B (razona sin terminar, content vacío) y AEON-7/Gemma-4-12B...Abliterated (no procesa imágenes por la API)

Al momento de ejecutar las pruebas śe comprobó siempre finish_reason y error en el cuerpo aunque el estado sea 200; la etiqueta Vision del catálogo no garantiza soporte por API

Comando de prueba y compilación:
<details>
<summary><b>Clic aqui para ver</b></summary>

...python
hans@workstation:~/Documents/Zanyi/test$ node --env-file=.env test-vision.mjs
Modelo: autotrust/JEV-27B-VL
Segundos: 21.436
Terminó por: stop
Tokens usados: 288
--- Respuesta cruda ---  
{
  "mensaje": "Via BCP\nEstimado Cliente, Se necesita Validar sus datos para eliminar el posible acceso restringido a sus cuentas. Validar Aqui:\nhttp://bit.ly/Valida-DatosBCP",
  "remitente": "+51996906224",
  "enlaces": [
    "http://bit.ly/Valida-DatosBCP"
  ],
  "que_se_pide": "Validar los datos personales a través del enlace proporcionado para eliminar el posible acceso restringido a las cuentas."
}
--- JSON válido ---
{
  mensaje: 'Via BCP\n' +
    'Estimado Cliente, Se necesita Validar sus datos para eliminar el posible acceso restringido a sus cuentas. Validar Aqui:\n' +
    'http://bit.ly/Valida-DatosBCP',
  remitente: '+51996906224',
  enlaces: [ 'http://bit.ly/Valida-DatosBCP' ],
  que_se_pide: 'Validar los datos personales a través del enlace proporcionado para eliminar el posible acceso restringido a las cuentas.'
}
hans@workstation:~/Documents/Zanyi/test$ 
...

</details>

