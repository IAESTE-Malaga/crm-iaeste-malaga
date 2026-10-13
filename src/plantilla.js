// Plantilla de contacto para empresas. Se inserta en el cuadro de redacción del hilo de correo
// (src/EmailThread.jsx) como texto plano: los correos del CRM se envían como texto.
// El logo de la firma se sirve desde /public del propio CRM; tiene que ser una URL pública para que se vea
// en el correo del destinatario: VITE_PUBLIC_URL (p. ej. https://crm.tudominio.org) o, si no, el dominio actual.
const LOGO_URL = `${(import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '')}/logo-iaeste-madrid.png`
const AZUL = '#0b3d59'
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const SEP = '-'.repeat(108)

const asuntoPlantilla = (emp) =>
  `IAESTE Madrid - Programa de prácticas internacionales para ${emp.nombre || 'su empresa'}`

const plantillaHtml = (emp, yo) => {
  const p = (t) => `<p style="margin:0 0 12px 0">${t}</p>`
  const li = (items) => `<ul style="margin:0 0 12px 0">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
  const hr = `<p style="margin:12px 0">${SEP}</p>`
  const cuerpo = [
    p(`Buenos días${emp.contacto ? ' ' + esc(emp.contacto) : ''},`),
    p(`Mi nombre es ${esc(yo || '(NOMBRE Y APELLIDO)')} y trabajo como parte de la Asociación internacional IAESTE. Como comenté por teléfono, este correo contiene información básica acerca de nuestro programa de prácticas internacionales, así como una presentación visual adjunta. Si hiciese falta más información al respecto, estamos abiertos a tener una reunión para profundizar más:`),
    p('<b>IAESTE</b> (International Association for the Exchange of Students for Technical Experience) es una organización internacional cuyo objetivo es promover la realización de prácticas remuneradas en empresas y entidades de diversos países para estudiantes de especialidades científico-técnicas, fomentando así la excelencia profesional y el desarrollo de las aptitudes personales en entornos multiculturales y pluridisciplinares.'),
    p('Adjunto para su información:'),
    li(['Presentación programa IAESTE', 'Modelo convenio']),
    p('Si están interesados en formalizar una oferta de prácticas a través del programa de movilidad IAESTE, el proceso sería el siguiente:'),
    p('Cumplimentar y enviar a <a href="mailto:iaestetlmd@gmail.com">iaestetlmd@gmail.com</a> la siguiente documentación:'),
    li(['Formulario oferta prácticas (1 por plaza ofertada). En este documento se detalla el perfil buscado.', 'Compromiso empresa', 'Acuerdo corresponsabilidad tratamiento datos']),
    p('<b>Características generales de la oferta de prácticas:</b>'),
    li([
      'La empresa determina la duración y el periodo de la práctica, con duración mínima de 6 semanas y máximo 1 año.',
      'El becario trabajará un máximo de 40 horas semanales de lunes a viernes.',
      'El becario recibirá una remuneración mínima de 800 euros netos mensuales por parte de la empresa, de forma que pueda mantenerse durante la práctica en nuestro país (con la posibilidad de ofrecer alojamiento, manutención y transporte, en lugar de la remuneración).',
      'La empresa recibirá el perfil de un estudiante que cumpla los requisitos solicitados (un perfil por oferta). Se dispondrá del plazo de dos semanas para evaluar y/o entrevistar al estudiante de forma online si se considera necesario.',
      'Tras la evaluación del perfil proporcionado, la empresa aceptará o rechazará al estudiante. Si este es aceptado, se procederá a la firma de un convenio entre IAESTE España, becario y la empresa que permita la incorporación del estudiante. En ningún caso será necesario un contrato laboral.',
    ]),
    hr,
    p('Indicarles que en el caso de becarios o recién graduados extracomunitarios que vengan a España a realizar una práctica mediante convenio por un periodo superior a 90 días y en aplicación del Real Decreto Ley 11/2018 de 31 de agosto- Disposición adicional decimoctava deberán estar provistos de la Autorización de residencia para prácticas no laborales mediante convenio.'),
    p('Para ello, la entidad que acoge al becario en prácticas (la empresa) debe solicitar de manera telemática a través de la plataforma MERCURIO <a href="https://sede.administracionespublicas.gob.es/mercurio/inicioMercurio.html">https://sede.administracionespublicas.gob.es/mercurio/inicioMercurio.html</a> esta Autorización de residencia para prácticas no laborales mediante convenio, en los términos que se indica en esta disposición.'),
    p('A la recepción del convenio les remitiremos copia firmada por IAESTE y Estudiante junto con resto de documentación requerida por la Administración, para que procedan a la solicitud de autorización para estancia por prácticas no laborales.'),
    p('La resolución de esta autorización se resolverá en el plazo máximo de 30 días. Si no se resuelve en dicho plazo, la autorización se entenderá estimada por silencio administrativo. Al día siguiente de que expire ese plazo la empresa deberá solicitar a la Administración el correspondiente Certificado de silencio.'),
    hr,
    p('Por último, informarles que deberán en su momento solicitar el nº de seguridad social y posterior alta en la TGSS como becario en prácticas externas.'),
    p('A estos efectos, la Administración ha abierto la posibilidad de que los autorizados al sistema RED (las empresas) realicen dicha solicitud a través de CASIA en relación con los trabajadores respecto de los cuales van a comunicar con posterioridad su alta. Para ello, se ha creado un nuevo trámite, “Solicitud de número de Seguridad Social”, que se encuentra ya disponible dentro de las subcategorías correspondientes a los trámites de Afiliación, altas y bajas &lt; Altas de trabajadores cuenta ajena.'),
    p('La documentación que deberá acompañar a dicha solicitud será la siguiente:'),
    p('TA.1 firmado por el becario, pasaporte o ID, NIE y convenio'),
    p('<b>• ALTA</b>'),
    p('Una vez la empresa disponga del CCC específico y del número de Seguridad Social del estudiante extranjero, el alta en el Régimen General de la Seguridad Social de los estudiantes se deberá realizar mediante el mismo procedimiento que el de un trabajador por cuenta ajena, realizando el trámite ante la Seguridad Social presencialmente o a través del Sistema Red.'),
    p('Código de alta: 1<br>Exclusión cotización: 986 (programas de formación)<br>Y la Relación Laboral de Carácter Especial (RLCE) dependiendo de si las prácticas son curriculares o extracurriculares:<br>·&nbsp; Curriculares: 9928<br>·&nbsp; Extracurriculares: 9927'),
    p('Quedamos a su disposición para cualquier consulta que tengan o para fijar una reunión. Gracias de antemano y un saludo,'),
  ].join('')

  const legal = 'font-family:Tahoma,Verdana,sans-serif;font-size:11px;line-height:1.7;color:#002e7a;text-align:justify;margin:0'
  const firma = `
<div style="font-family:Tahoma,Verdana,sans-serif;font-size:13px;color:${AZUL};margin-top:24px">
  <b>${esc(yo || '(NOMBRE Y APELLIDO)')}</b><br>
  Equipo de Empresas IAESTE TLMA<br><br>
  <b>IAESTE Telecomunicación Madrid</b><br>
  E.T.S.I. Telecomunicación Madrid - Local 206 - L<br>
  Avenida Complutense, 30, 28040, Madrid<br>
  <a href="https://www.iaeste.es" style="color:#1155cc">www.iaeste.es</a><br><br>
  <img src="${LOGO_URL}" alt="IAESTE Madrid" width="240" height="73" style="display:block;border:0"><br>
</div>
<p style="${legal}">${'-'.repeat(134)}</p>
<p style="${legal}"><b><u>Legal notice</u>:</b></p>
<p style="${legal}"><b><u>Data protection</u>.</b> IAESTE ESPAÑA informs you that your email address, as well as the rest of your personal data, will be used for contacting you and providing you with our services. This data is necessary to communicate with you, which allows us to use your information within legal limits. Additionally, entities which require access to your information so that we can provide our services may have access to it. We will keep your data during our relationship and for the period required by applicable law. You may contact us at any time to find out the information we have on you, correct it if it is incorrect and delete it once our relationship has ended. You also have the right to request the transfer of your information to another entity (portability). To request any of these rights, you must make a written request to our address, along with a photocopy of your DNI identity document: IAESTE ESPAÑA, UNIVERSIDAD POLITÉCNICA DE VALENCIA, EDIFICIO 8K, PLANTA BAJA, ALA OESTE, DESPACHOS 11-13,CP 46022 VALENCIA. In case of considering your rights to have been neglected, you can lodge a claim before the Spanish Data Protection Agency (<a href="https://www.agpd.es" style="color:#1155cc">www.agpd.es</a>).</p>
<p style="${legal}"><b><u>Confidentiality</u>.</b> - The content of this communication, as well as all documentation attached, is confidential and intended for its recipient. In the case of you not being the intended recipient, we request that you notify us and do not communicate its content to third parties, proceeding to delete it.</p>
<p style="${legal}"><b><u>Exemption from liability</u>.</b> - The sending of this communication does not entail the sender’s obligation to monitor the absence of viruses, worms, trojan horses and/or any other harmful computer program, the recipient having to have the necessary hardware and software tools to guarantee both the security of their information system and the detection and elimination of harmful computer programs. IAESTE ESPAÑA is not liable for liquidated damages that such computer programs may cause to the recipient.</p>`

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${cuerpo}</div>${firma}`
}

// Versión en texto plano (por si el destino del pegado no acepta HTML)
const htmlATexto = (html) => {
  const d = document.createElement('div')
  d.innerHTML = html.replace(/<\/(p|li|div)>/g, '</$1>\n').replace(/<li>/g, '<li>- ')
  return d.innerText.replace(/\n{3,}/g, '\n\n').trim()
}

export { asuntoPlantilla }
export const plantillaTexto = (emp, yo) => htmlATexto(plantillaHtml(emp, yo))
