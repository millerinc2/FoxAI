'use strict';

/**

FoxAI - Professional Document Generation Engine v2.0.26

Supports: PDF, DOCX, XLSX, PPTX.

Target: Node.js (Render)

Author: Jefferson Stivem Mendez
*/

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const docx = require('docx');
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

// --- CONFIGURACIÓN DE RUTAS ---
const GENERATED_DIR = path.join(__dirname, 'generated');
const TEMP_DIR = path.join(GENERATED_DIR, 'temp');

// Inicialización de directorios
if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/**

Clase principal para la gestión de documentos reales
*/
class DocumentGenerator {
constructor() {
this.styles = {
primaryColor: '#1a1a1a',
accentColor: '#007bff',
fontFamily: 'Helvetica'
};
this.initAutoCleanup();
}

// ==========================================
// GENERACIÓN DE PDF (PDFKit)
// ==========================================
async generatePDF(data) {
const fileName = FoxAI_${uuidv4()}.pdf;
const filePath = path.join(GENERATED_DIR, fileName);
const doc = new PDFDocument({ margin: 50, size: 'A4' });

 return new Promise((resolve, reject) => {
     const stream = fs.createWriteStream(filePath);
     doc.pipe(stream);

     try {
         // Encabezado
         doc.fillColor(this.styles.accentColor)
            .fontSize(25)
            .text(data.title || 'Informe FoxAI', { align: 'center' });

         doc.moveDown();
         doc.strokeColor('#cccccc')
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(550, doc.y)
            .stroke();

         doc.moveDown();

         // Contenido principal
         doc.fillColor(this.styles.primaryColor)
            .fontSize(12)
            .text(data.content || 'Sin contenido especificado.', {
                align: 'justify',
                lineGap: 5
            });

         // Tablas simuladas (si existen datos)
         if (data.table) {
             doc.moveDown();
             this.drawPDFTable(doc, data.table);
         }

         // Pie de página
         const range = doc.bufferedPageRange();
         for (let i = range.start; i < (range.start + range.count); i++) {
             doc.switchToPage(i);
             doc.fontSize(8)
                .fillColor('#999999')
                .text(`Generado por FoxAI para ${data.userName || 'Usuario'} - Página ${i + 1}`, 
                      50, 750, { align: 'center' });
         }

         doc.end();
         stream.on('finish', () => {
             logger.info(`PDF Generado: ${fileName}`);
             resolve({ success: true, path: filePath, fileName, type: 'pdf' });
         });

     } catch (err) {
         logger.error('Error generando PDF', err);
         reject(err);
     }
 });
}

drawPDFTable(doc, tableData) {
const startX = 50;
let startY = doc.y + 10;
const colWidth = 120;
const rowHeight = 20;

 doc.fontSize(10).fillColor('#ffffff');
 // Header
 doc.rect(startX, startY, colWidth * tableData.headers.length, rowHeight).fill(this.styles.accentColor);
 tableData.headers.forEach((header, i) => {
     doc.text(header, startX + (i * colWidth) + 5, startY + 5);
 });

 startY += rowHeight;
 doc.fillColor(this.styles.primaryColor);
 // Rows
 tableData.rows.forEach(row => {
     row.forEach((cell, i) => {
         doc.text(cell.toString(), startX + (i * colWidth) + 5, startY + 5);
         doc.rect(startX + (i * colWidth), startY, colWidth, rowHeight).stroke();
     });
     startY += rowHeight;
 });
}

// ==========================================
// GENERACIÓN DE DOCX (docx)
// ==========================================
async generateDOCX(data) {
const fileName = FoxAI_${uuidv4()}.docx;
const filePath = path.join(GENERATED_DIR, fileName);

 const docObj = new docx.Document({
     sections: [{
         properties: {},
         children: [
             new docx.Paragraph({
                 text: data.title || "Documento FoxAI",
                 heading: docx.HeadingLevel.HEADING_1,
                 alignment: docx.AlignmentType.CENTER,
             }),
             new docx.Paragraph({
                 children: [
                     new docx.TextRun({
                         text: `Fecha: ${new Date().toLocaleDateString()}`,
                         bold: true,
                     }),
                 ],
             }),
             new docx.Paragraph({
                 text: data.content || "Contenido de texto generado por IA.",
                 spacing: { before: 400, after: 400 },
             }),
             ...this.buildDOCXList(data.items || [])
         ],
     }],
 });

 try {
     const buffer = await docx.Packer.toBuffer(docObj);
     fs.writeFileSync(filePath, buffer);
     logger.info(`DOCX Generado: ${fileName}`);
     return { success: true, path: filePath, fileName, type: 'docx' };
 } catch (err) {
     logger.error('Error generando DOCX', err);
     throw err;
 }
}

buildDOCXList(items) {
return items.map(item => new docx.Paragraph({
text: item,
bullet: { level: 0 }
}));
}

// ==========================================
// GENERACIÓN DE XLSX (ExcelJS)
// ==========================================
async generateXLSX(data) {
const fileName = FoxAI_${uuidv4()}.xlsx;
const filePath = path.join(GENERATED_DIR, fileName);
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Reporte FoxAI');

 // Estilos de encabezado
 sheet.columns = (data.columns || ['ID', 'Descripción', 'Valor']).map(col => ({
     header: col, key: col.toLowerCase(), width: 25
 }));

 sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
 sheet.getRow(1).fill = {
     type: 'pattern',
     pattern: 'solid',
     fgColor: { argb: 'FF007BFF' }
 };

 // Agregar datos
 if (data.rows) {
     sheet.addRows(data.rows);
 }

 try {
     await workbook.xlsx.writeFile(filePath);
     logger.info(`XLSX Generado: ${fileName}`);
     return { success: true, path: filePath, fileName, type: 'xlsx' };
 } catch (err) {
     logger.error('Error generando XLSX', err);
     throw err;
 }
}

// ==========================================
// GENERACIÓN DE PPTX (PptxGenJS)
// ==========================================
async generatePPTX(data) {
const fileName = FoxAI_${uuidv4()}.pptx;
const filePath = path.join(GENERATED_DIR, fileName);
const pres = new PptxGenJS();

 // Slide 1: Título
 let slide1 = pres.addSlide();
 slide1.background = { fill: "F1F1F1" };
 slide1.addText(data.title || "Presentación FoxAI", {
     x: 1, y: 1, w: '80%', h: 1.5, align: 'center', fontSize: 44, color: '007BFF', bold: true
 });
 slide1.addText(`Por: ${data.userName || 'FoxAI Engine'}`, {
     x: 1, y: 3, w: '80%', align: 'center', fontSize: 18, color: '666666'
 });

 // Slide 2: Contenido
 if (data.slides) {
     data.slides.forEach(s => {
         let slide = pres.addSlide();
         slide.addText(s.title, { x: 0.5, y: 0.5, fontSize: 28, color: '007BFF' });
         slide.addText(s.body, { x: 0.5, y: 1.5, fontSize: 14, color: '333333', bullet: true });
     });
 }

 try {
     await pres.writeFile({ fileName: filePath });
     logger.info(`PPTX Generado: ${fileName}`);
     return { success: true, path: filePath, fileName, type: 'pptx' };
 } catch (err) {
     logger.error('Error generando PPTX', err);
     throw err;
 }
}

// ==========================================
// UTILIDADES Y MANTENIMIENTO
// ==========================================

/**

Limpieza automática de archivos antiguos para no saturar el disco de Render
*/
initAutoCleanup() {
const ONE_HOUR = 60 * 60 * 1000;
setInterval(() => {
fs.readdir(GENERATED_DIR, (err, files) => {
if (err) return;
const now = Date.now();
files.forEach(file => {
if (file === 'temp') return;
const filePath = path.join(GENERATED_DIR, file);
const stats = fs.statSync(filePath);
if (now - stats.mtimeMs > ONE_HOUR) {
fs.unlinkSync(filePath);
logger.debug(Archivo temporal eliminado: ${file});
}
});
});
}, ONE_HOUR);
}

/**

Validador de entrada de datos
*/
validateInput(data) {
if (!data || typeof data !== 'object') return false;
return !!data.title;
}
}

// Singleton Instance
const DocumentGen = new DocumentGenerator();

/**

Handler universal para la IA
*/
async function createDocumentFromAI(type, aiContent, userData) {
const data = {
title: aiContent.title || 'Documento Generado por FoxAI',
content: aiContent.text || aiContent,
userName: userData.name || 'Jefferson',
table: aiContent.table || null,
rows: aiContent.excelRows || [],
slides: aiContent.slides || []
};

switch (type.toLowerCase()) {
case 'pdf': return await DocumentGen.generatePDF(data);
case 'docx': return await DocumentGen.generateDOCX(data);
case 'xlsx': return await DocumentGen.generateXLSX(data);
case 'pptx': return await DocumentGen.generatePPTX(data);
default: throw new Error('Formato de documento no soportado');
}
}

module.exports = {
generatePDF: (d) => DocumentGen.generatePDF(d),
generateDOCX: (d) => DocumentGen.generateDOCX(d),
generateXLSX: (d) => DocumentGen.generateXLSX(d),
generatePPTX: (d) => DocumentGen.generatePPTX(d),
createFromAI: createDocumentFromAI,
paths: { generated: GENERATED_DIR }
};

/**

FOXAI DOCUMENT ENGINE

Diseñado para crear entregables profesionales de alta calidad.

Integración nativa con el flujo de Jefferson Stivem Mendez.
*/
// Fin del archivo documentGen.js