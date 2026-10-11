import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { DocumentAnalysis, StoredDocumentRecord } from '../types';

export interface GeneratedWebBundle {
  html: string;
  css: string;
  javascript: string;
  fullStandaloneHtml: string;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Real Client-Side Binary PDF Generator using jsPDF
 * Generates a downloadable, multi-page structured PDF document directly in the browser.
 */
export function generateRealPdfBlob(analysis: DocumentAnalysis, fileNameSlug: string): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 18) {
      doc.addPage();
      y = 20;
    }
  };

  const writeHeading = (text: string, size = 14) => {
    checkPageBreak(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(29, 78, 216);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.42) + 3;
  };

  const writeSubheading = (text: string, size = 11) => {
    checkPageBreak(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.4) + 2;
  };

  const writeParagraph = (text: string, size = 10) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(text || '', maxWidth);
    for (const line of lines) {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 2;
  };

  // Cover Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('JAIRRESTAURA IA DE ESTUDIO — INFORME EDUCATIVO COMPLETO', margin, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(analysis.documentTitle, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 7.5 + 2;

  writeParagraph(
    `Tema Principal: ${analysis.detectedMainTopic || analysis.documentTitle} | Tiempo estimado: ${analysis.estimatedReadingMinutes} min | Palabras: ${analysis.wordCountEstimate}`,
    9.5
  );
  y += 3;

  // 1. Executive Summary
  writeHeading('1. Resumen Ejecutivo');
  writeSubheading('Tesis Central:');
  writeParagraph(analysis.executiveSummary.thesisStatement);
  writeSubheading('Sintesis General:');
  writeParagraph(analysis.executiveSummary.overview);

  if (analysis.executiveSummary.keyFindings?.length) {
    writeSubheading('Hallazgos Clave:');
    analysis.executiveSummary.keyFindings.forEach((f, idx) => {
      writeParagraph(`${idx + 1}. ${f}`);
    });
  }

  // 2. Chapters
  writeHeading('2. Capitulos Estructurados');
  (analysis.chapters || []).forEach((ch) => {
    writeSubheading(`Capitulo ${ch.number}: ${ch.title}`);
    writeParagraph(`Sintesis: ${ch.summary}`);
    writeParagraph(ch.detailedContent);
  });

  // 3. Key Concepts
  writeHeading('3. Conceptos Clave');
  (analysis.keyConcepts || []).forEach((c) => {
    writeSubheading(`${c.name} (${c.category} - ${c.importanceLevel})`);
    writeParagraph(c.definition);
    writeParagraph(`Ejemplo practico: ${c.practicalExample}`);
  });

  // 4. Flashcards
  writeHeading('4. Flashcards de Estudio');
  (analysis.flashcards || []).forEach((fc, idx) => {
    writeSubheading(`Tarjeta ${idx + 1}: ${fc.front}`);
    writeParagraph(`Respuesta: ${fc.back}`);
    writeParagraph(`Pista: ${fc.mnemonicHint}`);
  });

  // 5. Quizzes
  writeHeading('5. Cuestionario de Evaluacion');
  (analysis.quizzes || []).forEach((q, idx) => {
    writeSubheading(`${idx + 1}. ${q.question}`);
    (q.options || []).forEach((opt, oIdx) => {
      const prefix = oIdx === q.correctIndex ? '[Correcta] ' : '   ';
      writeParagraph(`${prefix}${String.fromCharCode(65 + oIdx)}) ${opt}`);
    });
    writeParagraph(`Explicacion: ${q.explanation}`);
  });

  // 6. Glossary
  writeHeading('6. Glosario Tecnico');
  (analysis.glossary || []).forEach((g) => {
    writeSubheading(`${g.term} (${g.category})`);
    writeParagraph(g.definition);
  });

  doc.save(`${fileNameSlug || 'documento_jairrestaura_ia'}.pdf`);
}

export const STARTER_STANDALONE_ANALYSIS: DocumentAnalysis = {
  documentTitle: 'JAIRRESTAURA IA DE ESTUDIO — Plataforma Educativa Inteligente',
  subtitle: 'Convierte cualquier documento PDF, DOCX, TXT, EPUB o PPTX en conocimiento inteligente',
  detectedMainTopic: 'Educación e Inteligencia Artificial Aplicada al Estudio',
  detectedDomain: 'Educación & Productividad',
  estimatedReadingMinutes: 12,
  wordCountEstimate: 2450,
  pageCountEstimate: 6,
  fullRawText:
    'Bienvenido a JAIRRESTAURA IA DE ESTUDIO. Sube cualquier documento PDF, DOCX o TXT en el panel superior para transformar automáticamente su contenido en capítulos estructurados, resúmenes ejecutivos, conceptos clave, flashcards interactivas, cuestionarios con calificación automática, glosario dinámico y tutoría inteligente con lectura por voz en tiempo real.',
  executiveSummary: {
    thesisStatement:
      'JAIRRESTAURA IA DE ESTUDIO transforma cualquier documento estático en un ecosistema interactivo de aprendizaje activo con lectura inmersiva por voz, flashcards, autoevaluación y tutoría inteligente.',
    overview:
      'Puedes subir cualquier archivo PDF, DOCX o TXT directamente desde esta página para extraer su texto en el navegador y generar al instante capítulos, conceptos clave, tarjetas de memoria, preguntas de examen y lectura continua en voz alta.',
    keyFindings: [
      'Extracción documental 100% en navegador compatible con PDF, DOCX y TXT.',
      'Lectura continua por voz con resaltado visual de capítulos y párrafos en tiempo real.',
      'Persistencia automática en IndexedDB y LocalStorage sin necesidad de servidor externo.',
    ],
    targetAudience: 'Estudiantes, investigadores, docentes y autodidactas.',
    actionableRecommendations: [
      'Haz clic en el botón Subir PDF/DOCX de arriba para analizar tu propio documento.',
      'Pulsa Escuchar Documento Completo para activar la lectura inmersiva con resaltado en vivo.',
    ],
  },
  chapters: [
    {
      number: 1,
      title: 'Ingesta Inteligente de Documentos (PDF, DOCX, TXT)',
      summary: 'Cómo cargar cualquier archivo y extraer su estructura completa en segundos.',
      detailedContent:
        'El motor documental procesa archivos PDF mediante PDF.js y documentos Word mediante Mammoth.js directamente en el navegador del usuario. Al subir un archivo, el sistema detecta automáticamente el tema principal, divide el contenido en capítulos lógicos y construye todos los módulos de estudio.',
      keyTakeaways: ['Soporte nativo PDF, DOCX y TXT', 'Detección automática de capítulos y tema principal'],
    },
    {
      number: 2,
      title: 'Sistema de Lectura por Voz e Inmersión Visual',
      summary: 'Escucha todo el documento con resaltado automático de capítulos y oraciones.',
      detailedContent:
        'El módulo de audio utiliza síntesis de voz para leer el documento completo de principio a fin, permitiendo pausar, continuar, cambiar de capítulo, ajustar la velocidad (0.5x a 2x) y seguir visualmente el párrafo exacto que se está pronunciando.',
      keyTakeaways: ['Lectura continua de principio a fin', 'Resaltado visual sincronizado y scroll automático'],
    },
    {
      number: 3,
      title: 'Aprendizaje Activo: Flashcards, Cuestionarios y Tutor IA',
      summary: 'Refuerza la retención mediante autoevaluación interactiva y memoria conversacional.',
      detailedContent:
        'Cada documento genera tarjetas interactivas 3D para memorización activa, cuestionarios calificables en tiempo real y un Tutor IA contextual capaz de responder preguntas sobre cualquier sección del texto.',
      keyTakeaways: ['Flashcards 3D interactivas', 'Cuestionario con calificación sobre 10', 'Tutor IA contextual'],
    },
  ],
  keyConcepts: [
    {
      name: 'Lectura Visual Sincronizada',
      category: 'Audio IA',
      importanceLevel: 'Esencial',
      definition: 'Despliegue automático del documento con iluminación en tiempo real del capítulo y párrafo leído por la voz.',
      practicalExample: 'Al pulsar Escuchar Documento, la vista abre los capítulos y hace scroll automático.',
    },
    {
      name: 'Persistencia en IndexedDB',
      category: 'Arquitectura',
      importanceLevel: 'Alta',
      definition: 'Base de datos local del navegador que guarda tus documentos analizados y tu progreso sin requerir servidor.',
      practicalExample: 'Al recargar la página en GitHub Pages, tus documentos siguen disponibles en la biblioteca.',
    },
  ],
  activities: [],
  quizzes: [
    {
      id: 1,
      question: '¿Qué ocurre cuando subes un archivo PDF o DOCX en JAIRRESTAURA IA DE ESTUDIO?',
      difficulty: 'Básico',
      options: [
        'Se extrae el texto real en el navegador y se generan capítulos, resumen, flashcards, cuestionario y audio.',
        'Solo se muestra el nombre del archivo sin analizar el contenido.',
        'Se requiere instalar un servidor externo adicional.',
        'Ninguna de las anteriores.',
      ],
      correctIndex: 0,
      explanation: 'Todo el procesamiento documental se ejecuta en el navegador mediante PDF.js, Mammoth.js e IndexedDB.',
    },
  ],
  examQuestions: [],
  glossary: [
    {
      term: 'JAIRRESTAURA IA DE ESTUDIO',
      category: 'Plataforma',
      definition: 'Plataforma educativa con inteligencia artificial que convierte cualquier documento en conocimiento inteligente.',
      contextUsage: 'Entorno integral de lectura, síntesis, audio y autoevaluación.',
    },
    {
      term: 'IndexedDB',
      category: 'Almacenamiento',
      definition: 'Sistema de base de datos persistente integrado en el navegador web.',
      contextUsage: 'Guarda la biblioteca de documentos y el progreso de lectura.',
    },
  ],
  conceptMap: {
    centralTheme: 'JAIRRESTAURA IA DE ESTUDIO',
    nodes: [],
    edges: [],
  },
  flashcards: [
    {
      id: 'fc-starter-1',
      category: 'Plataforma',
      difficulty: 'Fácil',
      front: '¿Qué formatos puedes cargar directamente en JAIRRESTAURA IA DE ESTUDIO?',
      back: 'Archivos PDF, DOCX, TXT, EPUB y PPTX, además de texto pegado directamente.',
      mnemonicHint: 'Formatos de estudio universales',
    },
  ],
};

export function buildWebBundle(
  analysisInput?: DocumentAnalysis | null,
  theme: 'light' | 'dark' | 'editorial' = 'editorial'
): GeneratedWebBundle {
  const analysis = analysisInput || STARTER_STANDALONE_ANALYSIS;
  const themeColors = {
    editorial: {
      bg: '#FAF9F6',
      surface: '#FFFFFF',
      text: '#0F172A',
      muted: '#475569',
      border: '#E2E8F0',
      accent: '#1D4ED8',
      accentSoft: '#EFF6FF',
    },
    light: {
      bg: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#090D16',
      muted: '#64748B',
      border: '#E2E8F0',
      accent: '#0F172A',
      accentSoft: '#F1F5F9',
    },
    dark: {
      bg: '#0B0F19',
      surface: '#111827',
      text: '#F8FAFC',
      muted: '#94A3B8',
      border: '#1E293B',
      accent: '#38BDF8',
      accentSoft: '#1E293B',
    },
  }[theme];

  const css = `/* ==========================================================================
   JAIRRESTAURA IA DE ESTUDIO — Hoja de Estilos de Producción para GitHub Pages (style.css)
   Eslogan: "Convierte cualquier documento en conocimiento inteligente"
   ========================================================================== */

:root {
  --bg-canvas: ${themeColors.bg};
  --bg-surface: ${themeColors.surface};
  --text-primary: ${themeColors.text};
  --text-muted: ${themeColors.muted};
  --border-hairline: ${themeColors.border};
  --accent-primary: ${themeColors.accent};
  --accent-soft: ${themeColors.accentSoft};
  --font-display: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-sans: 'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

body.dark-theme {
  --bg-canvas: #090D16;
  --bg-surface: #111827;
  --text-primary: #F8FAFC;
  --text-muted: #94A3B8;
  --border-hairline: #1E293B;
  --accent-primary: #38BDF8;
  --accent-soft: #1E293B;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
  font-family: var(--font-sans);
  background-color: var(--bg-canvas);
  color: var(--text-primary);
  line-height: 1.65;
}

body {
  min-height: 100vh;
  overflow-x: hidden;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.reading-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--accent-primary);
  width: 0%;
  z-index: 100;
  transition: width 0.12s ease-out;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border-hairline);
  padding: 0.9rem 1.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

body.dark-theme .site-header {
  background: rgba(17, 24, 39, 0.88);
}

.site-brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text-primary);
  text-decoration: none;
  white-space: nowrap;
}

.site-nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.site-nav a {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 500;
  transition: color 0.15s ease;
}

.site-nav a:hover {
  color: var(--accent-primary);
}

.btn-action {
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--border-hairline);
  border-radius: 0.4rem;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  cursor: pointer;
}

.btn-action.primary {
  background: var(--accent-primary);
  color: #FFFFFF;
  border-color: var(--accent-primary);
}

.btn-action:hover {
  border-color: var(--accent-primary);
}

.container {
  max-width: 1180px;
  margin: 0 auto;
  padding: 2.25rem 1.5rem;
}

/* Welcome & Upload Hero Card */
.welcome-upload-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: 0.9rem;
  padding: 1.75rem;
  margin-bottom: 2.25rem;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.welcome-steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.85rem;
  margin: 1.15rem 0 1.4rem 0;
}

.welcome-step-pill {
  background: var(--bg-canvas);
  border: 1px solid var(--border-hairline);
  border-radius: 0.6rem;
  padding: 0.85rem 1rem;
  font-size: 0.82rem;
}

.upload-zone {
  border: 2px dashed var(--border-hairline);
  border-radius: 0.75rem;
  padding: 1.5rem;
  background: var(--bg-canvas);
  text-align: center;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.upload-zone:hover {
  border-color: var(--accent-primary);
}

/* Guided Tour Spotlight Overlay */
.tour-spotlight-ring {
  position: fixed;
  z-index: 9998;
  pointer-events: none;
  border-radius: 0.75rem;
  border: 2px solid #2563EB;
  box-shadow: 0 0 0 9999px rgba(9, 13, 22, 0.74);
  transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  display: none;
}

.tour-tooltip-card {
  position: fixed;
  z-index: 9999;
  width: min(92vw, 430px);
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid #3B82F6;
  border-radius: 1rem;
  padding: 1.35rem;
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.42);
  display: none;
  transition: top 0.25s ease, left 0.25s ease;
}

.tour-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--accent-primary);
  background: var(--accent-soft);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.tour-dots {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.tour-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--border-hairline);
  border: none;
  cursor: pointer;
}

.tour-dot.active {
  width: 22px;
  background: var(--accent-primary);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 1rem;
  margin-bottom: 2.25rem;
}

.kpi-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: 0.65rem;
  padding: 1.15rem;
}

.kpi-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
}

.kpi-value {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 0.25rem;
}

.hero-banner {
  padding-bottom: 2rem;
  margin-bottom: 2.25rem;
  border-bottom: 1px solid var(--border-hairline);
}

.hero-kicker {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent-primary);
  margin-bottom: 0.65rem;
  display: block;
}

.hero-title {
  font-family: var(--font-display);
  font-size: clamp(1.85rem, 3.5vw, 2.75rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin-bottom: 0.75rem;
}

.hero-subtitle {
  font-size: 1.02rem;
  color: var(--text-muted);
  max-width: 75ch;
  margin-bottom: 1rem;
}

.section-block {
  margin-bottom: 3.5rem;
  scroll-margin-top: 5rem;
}

.section-header {
  margin-bottom: 1.35rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--border-hairline);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.section-title {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
}

.thesis-callout {
  background: var(--accent-soft);
  border: 1px solid var(--border-hairline);
  border-radius: 0.65rem;
  padding: 1.35rem;
  margin-bottom: 1.25rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 1.1rem;
}

.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: 0.65rem;
  padding: 1.3rem;
}

.card-meta {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--accent-primary);
  margin-bottom: 0.4rem;
}

.card-title {
  font-family: var(--font-display);
  font-size: 1.04rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.chapter-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: 0.65rem;
  margin-bottom: 0.85rem;
  overflow: hidden;
}

.chapter-header {
  width: 100%;
  background: none;
  border: none;
  padding: 1.1rem 1.3rem;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
}

.chapter-body {
  padding: 0 1.3rem 1.3rem 1.3rem;
  border-top: 1px solid var(--border-hairline);
  display: none;
}

.chapter-item.open .chapter-body {
  display: block;
  padding-top: 1rem;
}

.flashcard-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: 0.65rem;
  padding: 1.3rem;
  cursor: pointer;
  min-height: 155px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.flashcard-box .fc-back {
  display: none;
  color: var(--accent-primary);
  font-weight: 500;
}

.flashcard-box.flipped .fc-front {
  display: none;
}

.flashcard-box.flipped .fc-back {
  display: block;
}

.quiz-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.7rem 0.95rem;
  margin-bottom: 0.45rem;
  border: 1px solid var(--border-hairline);
  border-radius: 0.45rem;
  background: var(--bg-canvas);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.88rem;
}

.quiz-option.correct {
  border-color: #16A34A;
  background: rgba(22, 163, 74, 0.12);
}

.quiz-option.incorrect {
  border-color: #DC2626;
  background: rgba(220, 38, 38, 0.12);
}

.quiz-feedback {
  display: none;
  margin-top: 0.6rem;
  padding: 0.7rem;
  border-radius: 0.45rem;
  background: var(--accent-soft);
  font-size: 0.84rem;
}

.chat-box {
  background: var(--bg-surface);
  border: 1px solid var(--border-hairline);
  border-radius: 0.65rem;
  padding: 1.3rem;
}

.chat-feed {
  max-height: 280px;
  overflow-y: auto;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.chat-bubble {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-hairline);
  font-size: 0.88rem;
}

.search-input {
  width: 100%;
  padding: 0.7rem 0.95rem;
  border: 1px solid var(--border-hairline);
  border-radius: 0.45rem;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.site-footer {
  border-top: 1px solid var(--border-hairline);
  padding: 2rem 1.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.82rem;
}
`;

  const chaptersHtml = (analysis.chapters || [])
    .map(
      (ch, idx) => `
      <article class="chapter-item ${idx === 0 ? 'open' : ''}">
        <button class="chapter-header" onclick="toggleChapter(this)">
          <span>Capítulo ${ch.number}: ${escapeHtml(ch.title)}</span>
          <span>▾</span>
        </button>
        <div class="chapter-body">
          <p style="color: var(--text-muted); margin-bottom: 0.75rem;"><strong>Síntesis:</strong> ${escapeHtml(ch.summary)}</p>
          <p style="margin-bottom: 0.75rem;">${escapeHtml(ch.detailedContent)}</p>
          <div style="font-size: 0.85rem; color: var(--accent-primary);">
            <strong>Puntos Clave:</strong> ${(ch.keyTakeaways || []).map((t) => escapeHtml(t)).join(' · ')}
          </div>
        </div>
      </article>`
    )
    .join('\n');

  const conceptsHtml = (analysis.keyConcepts || [])
    .map(
      (c) => `
      <article class="card">
        <div class="card-meta">${escapeHtml(c.category)} · ${escapeHtml(c.importanceLevel)}</div>
        <h3 class="card-title">${escapeHtml(c.name)}</h3>
        <p style="font-size: 0.9rem; margin-bottom: 0.65rem;">${escapeHtml(c.definition)}</p>
        <p style="font-size: 0.82rem; color: var(--text-muted);"><strong>Ejemplo práctico:</strong> ${escapeHtml(c.practicalExample)}</p>
      </article>`
    )
    .join('\n');

  const flashcardsHtml = (analysis.flashcards || [])
    .map(
      (fc, idx) => `
      <div class="flashcard-box" onclick="this.classList.toggle('flipped')">
        <div>
          <div class="card-meta">TARJETA 0${idx + 1} · ${escapeHtml(fc.category)}</div>
          <div class="fc-front"><h3 class="card-title">${escapeHtml(fc.front)}</h3></div>
          <div class="fc-back"><p>${escapeHtml(fc.back)}</p></div>
        </div>
        <div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); margin-top: 0.75rem;">
          Clic para voltear · Pista: ${escapeHtml(fc.mnemonicHint)}
        </div>
      </div>`
    )
    .join('\n');

  const quizzesHtml = (analysis.quizzes || [])
    .map(
      (q, qIdx) => `
      <div class="card quiz-card" data-question-index="${qIdx}" style="margin-bottom: 1rem;">
        <div class="card-meta">PREGUNTA 0${qIdx + 1} · ${escapeHtml(q.difficulty)}</div>
        <h3 class="card-title">${escapeHtml(q.question)}</h3>
        <div>
          ${(q.options || [])
            .map(
              (opt, oIdx) => `
            <button class="quiz-option" onclick="selectQuizOption(${qIdx}, ${oIdx}, ${q.correctIndex})">
              ${String.fromCharCode(65 + oIdx)}. ${escapeHtml(opt)}
            </button>`
            )
            .join('\n')}
        </div>
        <div class="quiz-feedback" id="quiz-feedback-${qIdx}">
          <strong>Explicación:</strong> ${escapeHtml(q.explanation)}
        </div>
      </div>`
    )
    .join('\n');

  const glossaryHtml = (analysis.glossary || [])
    .map(
      (g) => `
      <div class="card glossary-entry">
        <div class="card-meta">${escapeHtml(g.category)}</div>
        <h3 class="card-title">${escapeHtml(g.term)}</h3>
        <p style="font-size: 0.88rem; margin-bottom: 0.45rem;">${escapeHtml(g.definition)}</p>
        <p style="font-size: 0.78rem; color: var(--text-muted);"><em>"${escapeHtml(g.contextUsage)}"</em></p>
      </div>`
    )
    .join('\n');

  const html = `
  <div class="reading-progress-bar" id="readingProgressBar"></div>

  <!-- Spotlight Guided Tour Overlay (Actives automatically when user uploads first file or clicks Tour Guiado) -->
  <div id="tourSpotlightRing" class="tour-spotlight-ring"></div>
  <div id="tourTooltipCard" class="tour-tooltip-card" role="dialog" aria-modal="true">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.65rem;">
      <span id="tourBadgeText" class="tour-badge">PASO 1 DE 6 · TOUR GUIADO</span>
      <button class="btn-action" onclick="closeGuidedTour()" style="padding:0.2rem 0.55rem;">Omitir ✕</button>
    </div>
    <h3 id="tourTitleText" style="font-family:var(--font-display); font-size:1.05rem; margin-bottom:0.45rem;"></h3>
    <p id="tourDescText" style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.55;"></p>
    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-hairline); padding-top:0.8rem;">
      <div id="tourDotsContainer" class="tour-dots"></div>
      <div style="display:flex; gap:0.4rem;">
        <button id="tourPrevBtn" class="btn-action" onclick="prevGuidedTourStep()">← Anterior</button>
        <button id="tourNextBtn" class="btn-action primary" onclick="nextGuidedTourStep()">Siguiente →</button>
      </div>
    </div>
  </div>

  <header class="site-header">
    <a href="#" class="site-brand">🧠 JAIRRESTAURA IA DE ESTUDIO</a>
    <nav class="site-nav">
      <a href="#ingesta">Subir PDF/DOCX</a>
      <a href="#dashboard">Biblioteca &amp; Calificaciones</a>
      <a href="#resumen">Resumen</a>
      <a href="#capitulos">Capítulos</a>
      <a href="#flashcards">Flashcards</a>
      <a href="#cuestionario">Cuestionario</a>
      <a href="#glosario">Glosario</a>
      <a href="#chat">Tutor IA</a>
    </nav>
    <div style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
      <button class="btn-action" onclick="startGuidedTour(0)">✨ Tour Guiado</button>
      <button class="btn-action" onclick="toggleDarkTheme()">Modo Oscuro</button>
      <button class="btn-action primary" onclick="exportStandalonePdf()">Exportar PDF</button>
    </div>
  </header>

  <main class="container">
    <!-- Enhanced Welcome Screen + Step-by-Step Onboarding & File Upload -->
    <section id="ingesta" class="welcome-upload-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
        <div>
          <div style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--accent-primary); margin-bottom: 0.3rem;">
            BIENVENIDO A JAIRRESTAURA IA DE ESTUDIO · MOTOR DOCUMENTAL DINÁMICO (PDF.JS + MAMMOTH.JS)
          </div>
          <h2 style="font-family: var(--font-display); font-size: 1.35rem;">
            Convierte cualquier documento en conocimiento inteligente
          </h2>
        </div>
        <button class="btn-action primary" onclick="startGuidedTour(0)">
          Iniciar Tour Paso a Paso (6 Secciones)
        </button>
      </div>

      <div class="welcome-steps-grid">
        <div class="welcome-step-pill">
          <strong style="color:var(--accent-primary);">1. Carga tu PDF/DOCX</strong>
          <p style="color:var(--text-muted); margin-top:0.2rem;">Extracción real en navegador sin servidores externos.</p>
        </div>
        <div class="welcome-step-pill">
          <strong style="color:var(--accent-primary);">2. Contenido 100% Propio</strong>
          <p style="color:var(--text-muted); margin-top:0.2rem;">Detecta el tema principal, capítulos, resumen y conceptos.</p>
        </div>
        <div class="welcome-step-pill">
          <strong style="color:var(--accent-primary);">3. Tour Guiado Automático</strong>
          <p style="color:var(--text-muted); margin-top:0.2rem;">Un overlay interactivo resaltará cada módulo clave al subir tu archivo.</p>
        </div>
      </div>

      <div class="upload-zone">
        <p style="font-size: 0.92rem; font-weight:600; margin-bottom: 0.45rem;">
          Selecciona o arrastra un archivo PDF, DOCX o TXT (Al terminar se iniciará el Tour Guiado con Overlay)
        </p>
        <input
          type="file"
          id="standaloneFileInput"
          accept=".pdf,.docx,.txt,.md"
          onchange="handleStandaloneFileUpload(event)"
          style="font-size: 0.82rem;"
        />
        <div id="standaloneUploadStatus" style="margin-top: 0.65rem; font-family: var(--font-mono); font-size: 0.78rem; color: var(--accent-primary);"></div>
      </div>
    </section>

    <section class="hero-banner" id="heroTopicBanner">
      <span class="hero-kicker" id="docDetectedTopic">TEMA DETECTADO: ${escapeHtml(analysis.detectedMainTopic || analysis.documentTitle)}</span>
      <h1 class="hero-title" id="docMainTitle">${escapeHtml(analysis.documentTitle)}</h1>
      <p class="hero-subtitle" id="docMainSubtitle">${escapeHtml(analysis.subtitle)}</p>
    </section>

    <section id="dashboard" class="section-block">
      <div class="section-header">
        <h2 class="section-title">01. Progreso, Calificaciones y Biblioteca (IndexedDB)</h2>
      </div>
      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">PALABRAS ANALIZADAS</div>
          <div class="kpi-value" id="kpiWords">${analysis.wordCountEstimate.toLocaleString('es-ES')}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">CONCEPTOS EXTRAÍDOS</div>
          <div class="kpi-value" id="kpiConcepts">${(analysis.keyConcepts || []).length}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">CALIFICACIÓN ACTUAL</div>
          <div class="kpi-value" id="kpiGrade">10.0 / 10</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">DOCUMENTOS EN BIBLIOTECA</div>
          <div class="kpi-value" id="kpiLibraryCount">1</div>
        </div>
      </div>

      <div class="card-grid">
        <div class="card">
          <div class="card-meta">BIBLIOTECA PERSISTENTE (INDEXEDDB)</div>
          <h3 class="card-title">Documentos Almacenados</h3>
          <div id="standaloneLibraryList" style="font-size: 0.85rem;"></div>
        </div>
        <div class="card">
          <div class="card-meta">HISTORIAL DE ANÁLISIS</div>
          <h3 class="card-title">Eventos Recientes</h3>
          <div id="standaloneHistoryList" style="font-size: 0.82rem; color: var(--text-muted);"></div>
        </div>
      </div>
    </section>

    <section id="resumen" class="section-block">
      <div class="section-header">
        <h2 class="section-title">02. Resumen Ejecutivo Nuevo</h2>
      </div>
      <div class="thesis-callout" id="docThesisBox">
        <strong>Tesis Central:</strong> ${escapeHtml(analysis.executiveSummary.thesisStatement)}
      </div>
      <div class="card" id="docOverviewBox">
        <p>${escapeHtml(analysis.executiveSummary.overview)}</p>
      </div>
    </section>

    <section id="capitulos" class="section-block">
      <div class="section-header">
        <h2 class="section-title">03. Capítulos Estructurados Nuevos</h2>
      </div>
      <div id="chaptersContainer">
        ${chaptersHtml}
      </div>
    </section>

    <section id="conceptos" class="section-block">
      <div class="section-header">
        <h2 class="section-title">04. Conceptos Clave Nuevos</h2>
      </div>
      <div class="card-grid" id="conceptsContainer">
        ${conceptsHtml}
      </div>
    </section>

    <section id="flashcards" class="section-block">
      <div class="section-header">
        <h2 class="section-title">05. Flashcards Interactivas Nuevas</h2>
        <button class="btn-action" onclick="addStandaloneFlashcardPrompt()">+ Crear Flashcard</button>
      </div>
      <div class="card-grid" id="flashcardsContainer">
        ${flashcardsHtml}
      </div>
    </section>

    <section id="cuestionario" class="section-block">
      <div class="section-header">
        <h2 class="section-title">06. Cuestionario Automático y Calificación</h2>
        <span id="quizScoreDisplay" style="font-family: var(--font-mono); font-size: 0.85rem;">
          Puntaje: 0 / ${(analysis.quizzes || []).length}
        </span>
      </div>
      <div id="quizzesContainer">
        ${quizzesHtml}
      </div>
    </section>

    <section id="glosario" class="section-block">
      <div class="section-header">
        <h2 class="section-title">07. Glosario Dinámico Nuevo</h2>
      </div>
      <input
        type="search"
        class="search-input"
        placeholder="Filtrar términos del glosario..."
        oninput="filterGlossary(this.value)"
      />
      <div class="card-grid" id="glossaryContainer">
        ${glossaryHtml}
      </div>
    </section>

    <section id="chat" class="section-block">
      <div class="section-header">
        <h2 class="section-title">08. Tutor IA Sobre el Documento</h2>
      </div>
      <div class="chat-box">
        <div class="chat-feed" id="standaloneChatFeed">
          <div class="chat-bubble">
            <strong>JAIRRESTAURA IA DE ESTUDIO:</strong> Pregúntame sobre cualquier capítulo, concepto clave, resumen o término del glosario del documento activo.
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <input
            type="text"
            id="standaloneChatInput"
            class="search-input"
            style="margin-bottom: 0;"
            placeholder="Escribe tu pregunta sobre el documento..."
            onkeydown="if(event.key==='Enter') askStandaloneAssistant()"
          />
          <button class="btn-action primary" onclick="askStandaloneAssistant()">Consultar</button>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <p><strong>JAIRRESTAURA IA DE ESTUDIO</strong> — "Convierte cualquier documento en conocimiento inteligente"</p>
  </footer>`;

  const javascript = `// ==========================================================================
// JAIRRESTAURA IA DE ESTUDIO — Motor Completo de Producción para GitHub Pages (script.js)
// Incluye: Tour Guiado con Spotlight Overlay, Carga PDF/DOCX/TXT, IndexedDB, Flashcards, Quiz y PDF
// ==========================================================================

let currentScore = 0;
const answeredQuestions = new Set();
let totalQuestions = ${(analysis.quizzes || []).length};

let DOCUMENT_KNOWLEDGE = ${JSON.stringify({
    title: analysis.documentTitle,
    detectedTopic: analysis.detectedMainTopic || analysis.documentTitle,
    subtitle: analysis.subtitle,
    wordCount: analysis.wordCountEstimate,
    thesis: analysis.executiveSummary.thesisStatement,
    overview: analysis.executiveSummary.overview,
    chapters: (analysis.chapters || []).map((c) => ({
      number: c.number,
      title: c.title,
      summary: c.summary,
      detailedContent: c.detailedContent,
    })),
    concepts: (analysis.keyConcepts || []).map((c) => ({
      name: c.name,
      category: c.category,
      def: c.definition,
      ex: c.practicalExample,
    })),
    flashcards: (analysis.flashcards || []).map((f) => ({
      category: f.category,
      front: f.front,
      back: f.back,
      hint: f.mnemonicHint,
    })),
    quizzes: (analysis.quizzes || []).map((q) => ({
      question: q.question,
      difficulty: q.difficulty,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    })),
    glossary: (analysis.glossary || []).map((g) => ({
      term: g.term,
      category: g.category,
      def: g.definition,
    })),
  })};

// ==========================================================================
// TOUR GUIADO INTERACTIVO CON OVERLAY SPOTLIGHT
// ==========================================================================
const TOUR_STEPS = [
  {
    selector: '#heroTopicBanner',
    badge: 'PASO 1 DE 6 · TEMA PRINCIPAL',
    title: 'Detección Automática del Tema Principal',
    desc: 'Al cargar tu documento, JAIRRESTAURA IA DE ESTUDIO identifica su Tema Principal, extensión léxica y construye todo el entorno de estudio propio.'
  },
  {
    selector: '#resumen',
    badge: 'PASO 2 DE 6 · RESUMEN EJECUTIVO',
    title: 'Tesis Central y Resumen Nuevo',
    desc: 'Aquí encuentras la síntesis ejecutiva y la tesis rectora extraídas directamente de los párrafos de tu archivo.'
  },
  {
    selector: '#capitulos',
    badge: 'PASO 3 DE 6 · CAPÍTULOS PROPIOS',
    title: 'Capítulos y Conceptos Clave',
    desc: 'Explora los capítulos desglosados del documento con sus puntos clave y definiciones fundamentales.'
  },
  {
    selector: '#flashcards',
    badge: 'PASO 4 DE 6 · MEMORIZACIÓN ACTIVA',
    title: 'Flashcards Interactivas 3D',
    desc: 'Haz clic en cualquier tarjeta para voltearla y repasar conceptos clave, o añade nuevas tarjetas personalizadas.'
  },
  {
    selector: '#cuestionario',
    badge: 'PASO 5 DE 6 · AUTOEVALUACIÓN',
    title: 'Cuestionario y Calificación Académica',
    desc: 'Responde las preguntas generadas a partir del documento para obtener retroalimentación inmediata y actualizar tu calificación.'
  },
  {
    selector: '#chat',
    badge: 'PASO 6 DE 6 · TUTOR IA',
    title: 'Tutor IA Contextual sobre el Documento',
    desc: 'Formula preguntas abiertas sobre cualquier capítulo, concepto o término del glosario y exporta tus resultados en PDF.'
  }
];

let currentTourStep = 0;
let isTourActive = false;

function startGuidedTour(stepIdx) {
  currentTourStep = typeof stepIdx === 'number' ? stepIdx : 0;
  isTourActive = true;
  renderGuidedTourStep();
}

function closeGuidedTour() {
  isTourActive = false;
  const ring = document.getElementById('tourSpotlightRing');
  const card = document.getElementById('tourTooltipCard');
  if (ring) ring.style.display = 'none';
  if (card) card.style.display = 'none';
  try {
    localStorage.setItem('jairrestaura_standalone_tour_done', 'true');
  } catch (e) {}
}

function nextGuidedTourStep() {
  if (currentTourStep < TOUR_STEPS.length - 1) {
    currentTourStep += 1;
    renderGuidedTourStep();
  } else {
    closeGuidedTour();
  }
}

function prevGuidedTourStep() {
  if (currentTourStep > 0) {
    currentTourStep -= 1;
    renderGuidedTourStep();
  }
}

function renderGuidedTourStep() {
  if (!isTourActive) return;
  const step = TOUR_STEPS[currentTourStep];
  const target = document.querySelector(step.selector);
  const ring = document.getElementById('tourSpotlightRing');
  const card = document.getElementById('tourTooltipCard');
  if (!ring || !card || !target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  setTimeout(() => {
    if (!isTourActive) return;
    const rect = target.getBoundingClientRect();
    ring.style.display = 'block';
    ring.style.top = Math.max(8, rect.top - 8) + 'px';
    ring.style.left = Math.max(8, rect.left - 8) + 'px';
    ring.style.width = Math.min(window.innerWidth - 16, rect.width + 16) + 'px';
    ring.style.height = (rect.height + 16) + 'px';

    document.getElementById('tourBadgeText').textContent = step.badge;
    document.getElementById('tourTitleText').textContent = step.title;
    document.getElementById('tourDescText').textContent = step.desc;

    const prevBtn = document.getElementById('tourPrevBtn');
    const nextBtn = document.getElementById('tourNextBtn');
    if (prevBtn) prevBtn.style.display = currentTourStep > 0 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.textContent = currentTourStep === TOUR_STEPS.length - 1 ? 'Finalizar Tour ✓' : 'Siguiente →';

    const dots = document.getElementById('tourDotsContainer');
    if (dots) {
      dots.innerHTML = TOUR_STEPS.map((_, idx) =>
        '<button class="tour-dot ' + (idx === currentTourStep ? 'active' : '') + '" onclick="startGuidedTour(' + idx + ')"></button>'
      ).join('');
    }

    card.style.display = 'block';
    const cardHeight = 230;
    let topPos = rect.bottom + 18;
    if (topPos + cardHeight > window.innerHeight - 12) {
      topPos = Math.max(16, rect.top - cardHeight - 18);
    }
    const leftPos = Math.max(16, Math.min(rect.left, window.innerWidth - 440));
    card.style.top = topPos + 'px';
    card.style.left = leftPos + 'px';
  }, 220);
}

window.addEventListener('resize', () => {
  if (isTourActive) renderGuidedTourStep();
});

let dbInstance = null;

function initLocalDatabase() {
  if (!('indexedDB' in window)) return;
  const req = indexedDB.open('JairRestauraGitHubPagesProductionDB', 1);
  req.onupgradeneeded = function(e) {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('documents')) {
      db.createObjectStore('documents', { keyPath: 'title' });
    }
    if (!db.objectStoreNames.contains('history')) {
      db.createObjectStore('history', { keyPath: 'id' });
    }
  };
  req.onsuccess = function(e) {
    dbInstance = e.target.result;
    saveDocToIndexedDB(DOCUMENT_KNOWLEDGE, 'Documento inicial indexado en biblioteca local.');
  };
}

function saveDocToIndexedDB(docObj, historyDetail) {
  if (!dbInstance) return;
  const tx = dbInstance.transaction(['documents', 'history'], 'readwrite');
  tx.objectStore('documents').put(docObj);
  tx.objectStore('history').put({
    id: 'hist-' + Date.now(),
    title: docObj.title,
    detail: historyDetail,
    timestamp: new Date().toLocaleString('es-ES')
  });
  tx.oncomplete = function() {
    refreshLibraryAndHistoryUI();
  };
}

function refreshLibraryAndHistoryUI() {
  if (!dbInstance) return;
  const tx = dbInstance.transaction(['documents', 'history'], 'readonly');
  const docReq = tx.objectStore('documents').getAll();
  const histReq = tx.objectStore('history').getAll();

  docReq.onsuccess = function() {
    const docs = docReq.result || [];
    const countEl = document.getElementById('kpiLibraryCount');
    if (countEl) countEl.textContent = String(docs.length);

    const listEl = document.getElementById('standaloneLibraryList');
    if (listEl) {
      listEl.innerHTML = docs.map((d, idx) =>
        '<div style="padding: 0.45rem 0; border-bottom: 1px solid var(--border-hairline); display:flex; justify-content:space-between; align-items:center;">' +
        '<span><strong>' + d.title + '</strong> (' + (d.wordCount || 500) + ' palabras)</span>' +
        '<button class="btn-action" onclick="loadDocFromLibrary(' + idx + ')">Abrir</button>' +
        '</div>'
      ).join('');
      window.__cachedDocs = docs;
    }
  };

  histReq.onsuccess = function() {
    const logs = (histReq.result || []).reverse().slice(0, 6);
    const histEl = document.getElementById('standaloneHistoryList');
    if (histEl) {
      histEl.innerHTML = logs.map((l) =>
        '<div style="padding: 0.35rem 0; border-bottom: 1px solid var(--border-hairline);">' +
        '<strong>' + l.title + '</strong>: ' + l.detail + ' <span style="opacity:0.7;">(' + l.timestamp + ')</span>' +
        '</div>'
      ).join('');
    }
  };
}

function loadDocFromLibrary(idx) {
  const docs = window.__cachedDocs || [];
  if (!docs[idx]) return;
  DOCUMENT_KNOWLEDGE = docs[idx];
  renderActiveDocumentUI();
}

async function handleStandaloneFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('standaloneUploadStatus');
  if (statusEl) statusEl.textContent = 'Extrayendo contenido real de ' + file.name + '...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    let rawText = '';
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.pdf') && window.pdfjsLib) {
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const pages = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((it) => it.str).join(' '));
      }
      rawText = pages.join('\\n\\n');
    } else if (lower.endsWith('.docx') && window.mammoth) {
      const res = await window.mammoth.extractRawText({ arrayBuffer });
      rawText = res.value;
    } else {
      rawText = new TextDecoder('utf-8').decode(arrayBuffer);
    }

    if (!rawText || rawText.trim().length < 10) {
      rawText = 'Contenido procesado del archivo ' + file.name;
    }

    const cleanTitle = file.name.replace(/\\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    const paragraphs = rawText.split(/\\n+/).map((p) => p.trim()).filter((p) => p.length > 30);
    const words = rawText.split(/\\s+/).filter(Boolean);

    const newDoc = {
      title: cleanTitle,
      detectedTopic: cleanTitle,
      subtitle: 'Documento procesado en navegador (' + words.length + ' palabras)',
      wordCount: words.length,
      thesis: paragraphs[0] || ('Síntesis estructural de ' + cleanTitle),
      overview: paragraphs.slice(0, 3).join('\\n\\n') || rawText.slice(0, 500),
      chapters: paragraphs.slice(0, 4).map((p, i) => ({
        number: i + 1,
        title: 'Capítulo ' + (i + 1) + ': ' + p.slice(0, 48) + '...',
        summary: p.slice(0, 180),
        detailedContent: p
      })),
      concepts: paragraphs.slice(0, 4).map((p, i) => ({
        name: 'Concepto Clave ' + (i + 1),
        category: cleanTitle,
        def: p.slice(0, 180),
        ex: 'Aplicación directa en ' + cleanTitle
      })),
      flashcards: paragraphs.slice(0, 4).map((p, i) => ({
        category: cleanTitle,
        front: '¿Qué expone la sección ' + (i + 1) + ' de ' + cleanTitle + '?',
        back: p.slice(0, 200),
        hint: 'Párrafo ' + (i + 1)
      })),
      quizzes: paragraphs.slice(0, 3).map((p, i) => ({
        question: '¿Cuál es el planteamiento correcto según la sección ' + (i + 1) + ' de ' + cleanTitle + '?',
        difficulty: 'Intermedio',
        options: [
          p.slice(0, 130),
          (paragraphs[(i + 1) % paragraphs.length] || 'Planteamiento secundario del texto.').slice(0, 120),
          'Una conclusión ajena al tema principal detectado.',
          'Ninguna de las anteriores.'
        ],
        correctIndex: 0,
        explanation: 'Extraído directamente del documento: ' + p.slice(0, 150)
      })),
      glossary: DOCUMENT_KNOWLEDGE.glossary
    };

    DOCUMENT_KNOWLEDGE = newDoc;
    renderActiveDocumentUI();
    saveDocToIndexedDB(newDoc, 'Archivo ' + file.name + ' procesado e indexado.');
    if (statusEl) statusEl.textContent = '¡Documento "' + cleanTitle + '" analizado! Iniciando Tour Guiado por las secciones clave...';

    // Automatically launch step-by-step guided overlay tour upon file load
    setTimeout(() => {
      startGuidedTour(0);
    }, 350);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Error al leer el archivo: ' + err.message;
  }
}

function renderActiveDocumentUI() {
  document.getElementById('docMainTitle').textContent = DOCUMENT_KNOWLEDGE.title;
  document.getElementById('docDetectedTopic').textContent = 'TEMA DETECTADO: ' + (DOCUMENT_KNOWLEDGE.detectedTopic || DOCUMENT_KNOWLEDGE.title);
  document.getElementById('docMainSubtitle').textContent = DOCUMENT_KNOWLEDGE.subtitle || '';
  document.getElementById('kpiWords').textContent = String(DOCUMENT_KNOWLEDGE.wordCount || 500);
  document.getElementById('kpiConcepts').textContent = String((DOCUMENT_KNOWLEDGE.concepts || []).length);
  document.getElementById('docThesisBox').innerHTML = '<strong>Tesis Central:</strong> ' + DOCUMENT_KNOWLEDGE.thesis;
  document.getElementById('docOverviewBox').innerHTML = '<p>' + DOCUMENT_KNOWLEDGE.overview + '</p>';
}

function exportStandalonePdf() {
  if (window.jspdf && window.jspdf.jsPDF) {
    const doc = new window.jspdf.jsPDF();
    doc.setFontSize(16);
    doc.text(DOCUMENT_KNOWLEDGE.title || 'JAIRRESTAURA IA DE ESTUDIO', 15, 20);
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(DOCUMENT_KNOWLEDGE.thesis + '\\n\\n' + DOCUMENT_KNOWLEDGE.overview, 180);
    doc.text(lines, 15, 32);
    doc.save((DOCUMENT_KNOWLEDGE.title || 'documento') + '.pdf');
  } else {
    window.print();
  }
}

function addStandaloneFlashcardPrompt() {
  const container = document.getElementById('flashcardsContainer');
  if (!container) return;
  const newCardHtml =
    '<div class="flashcard-box" onclick="this.classList.toggle(\\'flipped\\')">' +
    '<div><div class="card-meta">TARJETA EXTRA · SÍNTESIS</div>' +
    '<div class="fc-front"><h3 class="card-title">¿Cuál es la tesis rectora de ' + DOCUMENT_KNOWLEDGE.title + '?</h3></div>' +
    '<div class="fc-back"><p>' + DOCUMENT_KNOWLEDGE.thesis + '</p></div></div>' +
    '<div style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); margin-top: 0.75rem;">Clic para voltear</div></div>';
  container.insertAdjacentHTML('afterbegin', newCardHtml);
}

window.addEventListener('DOMContentLoaded', initLocalDatabase);

window.addEventListener('scroll', () => {
  const bar = document.getElementById('readingProgressBar');
  if (!bar) return;
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docHeight > 0 ? Math.min(100, Math.round((scrollTop / docHeight) * 100)) : 0;
  bar.style.width = pct + '%';
});

function toggleDarkTheme() {
  document.body.classList.toggle('dark-theme');
  try {
    localStorage.setItem('jairrestaura_theme_dark', document.body.classList.contains('dark-theme'));
  } catch (e) {}
}

function toggleChapter(btn) {
  const item = btn.closest('.chapter-item');
  if (item) item.classList.toggle('open');
}

function selectQuizOption(questionIdx, selectedIdx, correctIdx) {
  const card = document.querySelector('.quiz-card[data-question-index="' + questionIdx + '"]');
  if (!card) return;

  const buttons = card.querySelectorAll('.quiz-option');
  buttons.forEach((btn, idx) => {
    btn.classList.remove('correct', 'incorrect');
    if (idx === correctIdx) {
      btn.classList.add('correct');
    } else if (idx === selectedIdx) {
      btn.classList.add('incorrect');
    }
  });

  const feedback = document.getElementById('quiz-feedback-' + questionIdx);
  if (feedback) feedback.style.display = 'block';

  if (!answeredQuestions.has(questionIdx)) {
    answeredQuestions.add(questionIdx);
    if (selectedIdx === correctIdx) currentScore += 1;
    const scoreEl = document.getElementById('quizScoreDisplay');
    if (scoreEl) scoreEl.textContent = 'Puntaje: ' + currentScore + ' / ' + totalQuestions;
    const gradeEl = document.getElementById('kpiGrade');
    if (gradeEl && totalQuestions > 0) {
      gradeEl.textContent = ((currentScore / totalQuestions) * 10).toFixed(1) + ' / 10';
    }
  }
}

function filterGlossary(query) {
  const normalized = (query || '').toLowerCase().trim();
  const entries = document.querySelectorAll('.glossary-entry');
  entries.forEach((entry) => {
    const text = (entry.textContent || '').toLowerCase();
    entry.style.display = text.includes(normalized) ? 'block' : 'none';
  });
}

const TUTOR_MEMORY_KEY = 'jairrestaura_standalone_tutor_memory_v2';
const MAX_TUTOR_MEMORY = 20;

function loadStandaloneTutorMemory() {
  try {
    const raw = localStorage.getItem(TUTOR_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_TUTOR_MEMORY) : [];
  } catch (e) {
    return [];
  }
}

function saveStandaloneTutorMemory(history) {
  try {
    const trimmed = (history || []).slice(-MAX_TUTOR_MEMORY);
    localStorage.setItem(TUTOR_MEMORY_KEY, JSON.stringify(trimmed));
  } catch (e) {}
}

function resolveStandaloneFollowUpSubject(question, history) {
  const q = (question || '').trim();
  const isFollowUp =
    /^(?:[¿¡]?)(?:c[oó]mo|por qu[eé]|cu[aá]ndo|d[oónde]|qu[eé]|cu[aá]l|cu[aá]les|qui[eé]n)\\s+(?:se|lo|la|los|las|le|les)\\b/i.test(q) ||
    /\\b(?:se controla|se maneja|se supera|se aplica|se evita|se previene|se trata|funciona|ocurre|causas|consecuencias|beneficios|ejemplos?|m[aá]s detalles|expl[ií]came m[aá]s)\\b/i.test(q) ||
    q.split(/\\s+/).length <= 5;

  if (!isFollowUp || !history || history.length === 0) {
    return { isFollowUp: false, subject: '', expandedQuery: q };
  }

  const recent = history.slice(-6).reverse();
  const stopWords = new Set(['como', 'cómo', 'que', 'qué', 'cual', 'cuál', 'cuando', 'donde', 'para', 'este', 'esta', 'estos', 'esas', 'sobre', 'segun', 'según', 'documento', 'explica', 'controla', 'maneja', 'supera', 'aplica', 'funciona', 'ocurre', 'tiene', 'puede']);

  for (const turn of recent) {
    const text = (turn.content || '').toLowerCase();
    for (const c of (DOCUMENT_KNOWLEDGE.concepts || [])) {
      if (c.name && text.includes(c.name.toLowerCase())) {
        return { isFollowUp: true, subject: c.name, expandedQuery: q + ' ' + c.name };
      }
    }
    for (const g of (DOCUMENT_KNOWLEDGE.glossary || [])) {
      if (g.term && text.includes(g.term.toLowerCase())) {
        return { isFollowUp: true, subject: g.term, expandedQuery: q + ' ' + g.term };
      }
    }
    if (turn.role === 'user') {
      const m = turn.content.match(/(?:qu[eé]\\s+es|sobre|acerca\\s+de|vencer|controlar|entender|explica)\\s+(?:el|la|los|las|un|una)?\\s*([a-záéíóúñü\\s]{3,35})/i);
      if (m && m[1]) {
        const clean = m[1].replace(/[?¿!¡.,;:]/g, '').trim();
        if (clean.length >= 3) {
          return { isFollowUp: true, subject: clean, expandedQuery: q + ' ' + clean };
        }
      }
      const words = turn.content.toLowerCase().replace(/[?¿!¡.,;:]/g, ' ').split(/\\s+/).filter((w) => w.length >= 4 && !stopWords.has(w));
      if (words.length > 0) {
        const subject = words.slice(0, 2).join(' ');
        return { isFollowUp: true, subject, expandedQuery: q + ' ' + subject };
      }
    }
  }

  const fallbackTopic = DOCUMENT_KNOWLEDGE.detectedTopic || DOCUMENT_KNOWLEDGE.title || '';
  return { isFollowUp: true, subject: fallbackTopic, expandedQuery: q + ' ' + fallbackTopic };
}

function renderSavedTutorHistory() {
  const feed = document.getElementById('standaloneChatFeed');
  if (!feed) return;
  const saved = loadStandaloneTutorMemory();
  saved.forEach((turn) => {
    const div = document.createElement('div');
    div.className = 'chat-bubble';
    div.innerHTML = (turn.role === 'user' ? '<strong>Tú:</strong> ' : '<strong>Profesor Tutor IA:</strong> ') + turn.content;
    feed.appendChild(div);
  });
  feed.scrollTop = feed.scrollHeight;
}

window.addEventListener('DOMContentLoaded', renderSavedTutorHistory);

async function askStandaloneAssistant() {
  const input = document.getElementById('standaloneChatInput');
  const feed = document.getElementById('standaloneChatFeed');
  if (!input || !feed) return;
  const q = input.value.trim();
  if (!q) return;

  const priorHistory = loadStandaloneTutorMemory();
  const followUp = resolveStandaloneFollowUpSubject(q, priorHistory);

  const userDiv = document.createElement('div');
  userDiv.className = 'chat-bubble';
  userDiv.innerHTML = '<strong>Tú:</strong> ' + q;
  feed.appendChild(userDiv);
  input.value = '';

  const lower = followUp.expandedQuery.toLowerCase();
  const tokens = lower.split(/\\s+/).filter((t) => t.length >= 3);

  const scoreItem = (text) => {
    const l = (text || '').toLowerCase();
    return tokens.reduce((acc, tok) => acc + (l.includes(tok) ? 3 : 0), 0);
  };

  const relevantChapters = (DOCUMENT_KNOWLEDGE.chapters || [])
    .slice()
    .sort((a, b) => scoreItem(b.title + ' ' + b.summary + ' ' + b.detailedContent) - scoreItem(a.title + ' ' + a.summary + ' ' + a.detailedContent))
    .slice(0, 2);

  const relatedConcepts = (DOCUMENT_KNOWLEDGE.concepts || [])
    .slice()
    .sort((a, b) => scoreItem(b.name + ' ' + b.def) - scoreItem(a.name + ' ' + a.def))
    .slice(0, 2);

  const relatedGlossary = (DOCUMENT_KNOWLEDGE.glossary || [])
    .slice()
    .sort((a, b) => scoreItem(b.term + ' ' + b.def) - scoreItem(a.term + ' ' + a.def))
    .slice(0, 2);

  let responseText = '';

  try {
    const apiRes = await fetch('/api/tutor/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        conversationHistory: priorHistory.slice(-MAX_TUTOR_MEMORY),
        structuredContext: {
          documentTitle: DOCUMENT_KNOWLEDGE.title,
          mainTopic: DOCUMENT_KNOWLEDGE.detectedTopic || DOCUMENT_KNOWLEDGE.title,
          resolvedFollowUpSubject: followUp.subject || undefined,
          summary: {
            thesisStatement: DOCUMENT_KNOWLEDGE.thesis,
            overview: DOCUMENT_KNOWLEDGE.overview,
            keyFindings: []
          },
          relevantChapters,
          relatedConcepts: relatedConcepts.map((c) => ({
            name: c.name,
            category: c.category,
            definition: c.def,
            practicalExample: c.ex
          })),
          glossaryTerms: relatedGlossary.map((g) => ({
            term: g.term,
            definition: g.def,
            contextUsage: ''
          }))
        }
      })
    });
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json && json.answer) responseText = json.answer;
    }
  } catch (e) {}

  if (!responseText) {
    const ch = relevantChapters[0];
    const kc = relatedConcepts[0];
    const gl = relatedGlossary[0];
    const thesisSentence = (DOCUMENT_KNOWLEDGE.thesis || '').trim();
    const chInsight = ch ? (ch.summary || '').trim() : '';

    const leadPrefix =
      followUp.isFollowUp && followUp.subject
        ? 'Continuando con ' + followUp.subject.toLowerCase() + ', según el documento '
        : 'Según el documento, comprender este punto parte de que ';

    responseText =
      leadPrefix +
      (thesisSentence ? thesisSentence.charAt(0).toLowerCase() + thesisSentence.slice(1) : '') +
      (chInsight ? ' Asimismo, la obra destaca como factor fundamental que ' + chInsight.charAt(0).toLowerCase() + chInsight.slice(1) : '') +
      (kc ? ' Para llevarlo a la práctica, conviene aplicar ' + kc.name.toLowerCase() + ' (' + kc.def + '), por ejemplo: ' + kc.ex + '.' : '') +
      (!kc && gl ? ' En este contexto resulta clave el término ' + gl.term.toLowerCase() + ', entendido como ' + gl.def + '.' : '');
  }

  const updatedHistory = priorHistory.concat([
    { role: 'user', content: q },
    { role: 'assistant', content: responseText }
  ]).slice(-MAX_TUTOR_MEMORY);
  saveStandaloneTutorMemory(updatedHistory);

  const aiDiv = document.createElement('div');
  aiDiv.className = 'chat-bubble';
  aiDiv.innerHTML = '<strong>Profesor Tutor IA:</strong> ' + responseText;
  feed.appendChild(aiDiv);
  feed.scrollTop = feed.scrollHeight;
}
`;

  const fullStandaloneHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(analysis.documentTitle)} — JAIRRESTAURA IA DE ESTUDIO (index.html Producción)</title>
  <meta name="description" content="Convierte cualquier documento en conocimiento inteligente." />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <!-- Librerías navegador para PDF, DOCX y exportación PDF real en GitHub Pages -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <style>
${css}
  </style>
</head>
<body>
${html}
  <script>
${javascript}
  </script>
</body>
</html>`;

  return {
    html,
    css,
    javascript,
    fullStandaloneHtml,
  };
}

export function generatePlainTextExport(analysis: DocumentAnalysis): string {
  const lines: string[] = [];
  lines.push('====================================================================');
  lines.push(`JAIRRESTAURA IA DE ESTUDIO — EXPORTACIÓN DE TEXTO PLANO (.TXT)`);
  lines.push(`"Convierte cualquier documento en conocimiento inteligente"`);
  lines.push('====================================================================');
  lines.push('');
  lines.push(`TÍTULO: ${analysis.documentTitle}`);
  lines.push(`TEMA PRINCIPAL: ${analysis.detectedMainTopic || analysis.documentTitle}`);
  lines.push(`SUBTÍTULO: ${analysis.subtitle}`);
  lines.push(
    `LECTURA ESTIMADA: ${analysis.estimatedReadingMinutes} min | PALABRAS: ${analysis.wordCountEstimate}`
  );
  lines.push('');
  lines.push('--------------------------------------------------------------------');
  lines.push('1. RESUMEN EJECUTIVO');
  lines.push('--------------------------------------------------------------------');
  lines.push(`Tesis Central: ${analysis.executiveSummary.thesisStatement}`);
  lines.push('');
  lines.push(analysis.executiveSummary.overview);
  lines.push('');
  lines.push('Hallazgos Clave:');
  (analysis.executiveSummary.keyFindings || []).forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
  lines.push('');
  lines.push('--------------------------------------------------------------------');
  lines.push('2. CAPÍTULOS DEL DOCUMENTO');
  lines.push('--------------------------------------------------------------------');
  (analysis.chapters || []).forEach((ch) => {
    lines.push(`\nCAPÍTULO ${ch.number}: ${ch.title}`);
    lines.push(`Síntesis: ${ch.summary}`);
    lines.push(ch.detailedContent);
  });
  lines.push('');
  lines.push('--------------------------------------------------------------------');
  lines.push('3. CONCEPTOS CLAVE');
  lines.push('--------------------------------------------------------------------');
  (analysis.keyConcepts || []).forEach((c) => {
    lines.push(`\n• ${c.name} [${c.category} - ${c.importanceLevel}]`);
    lines.push(`  Definición: ${c.definition}`);
    lines.push(`  Ejemplo: ${c.practicalExample}`);
  });
  lines.push('');
  lines.push('--------------------------------------------------------------------');
  lines.push('4. FLASHCARDS DE ESTUDIO');
  lines.push('--------------------------------------------------------------------');
  (analysis.flashcards || []).forEach((fc, i) => {
    lines.push(`\n[Tarjeta ${i + 1}] Pregunta: ${fc.front}`);
    lines.push(`Respuesta: ${fc.back}`);
    lines.push(`Pista: ${fc.mnemonicHint}`);
  });
  lines.push('');
  lines.push('--------------------------------------------------------------------');
  lines.push('5. CUESTIONARIO DE EVALUACIÓN');
  lines.push('--------------------------------------------------------------------');
  (analysis.quizzes || []).forEach((q, i) => {
    lines.push(`\n${i + 1}. ${q.question}`);
    (q.options || []).forEach((opt, oIdx) => {
      const prefix = oIdx === q.correctIndex ? '[CORRECTA]' : '          ';
      lines.push(`   ${prefix} ${String.fromCharCode(65 + oIdx)}) ${opt}`);
    });
    lines.push(`   Explicación: ${q.explanation}`);
  });
  lines.push('');
  lines.push('--------------------------------------------------------------------');
  lines.push('6. GLOSARIO DINÁMICO');
  lines.push('--------------------------------------------------------------------');
  (analysis.glossary || []).forEach((g) => {
    lines.push(`• ${g.term} (${g.category}): ${g.definition}`);
  });

  return lines.join('\n');
}

export function generateMarkdownExport(analysis: DocumentAnalysis): string {
  const lines: string[] = [];
  lines.push(`# ${analysis.documentTitle} — JAIRRESTAURA IA DE ESTUDIO`);
  lines.push(`> **${analysis.subtitle}**`);
  lines.push(
    `> *Tema detectado: ${analysis.detectedMainTopic || analysis.documentTitle} · Tiempo estimado de lectura: ${analysis.estimatedReadingMinutes} min · Palabras: ${analysis.wordCountEstimate}*`
  );
  lines.push('');
  lines.push(`## 1. Resumen Ejecutivo`);
  lines.push(`**Tesis Central:** ${analysis.executiveSummary.thesisStatement}`);
  lines.push('');
  lines.push(analysis.executiveSummary.overview);
  lines.push('');
  lines.push(`### Hallazgos Clave`);
  (analysis.executiveSummary.keyFindings || []).forEach((f) => lines.push(`- ${f}`));
  lines.push('');
  lines.push(`## 2. Capítulos Estructurados`);
  (analysis.chapters || []).forEach((ch) => {
    lines.push(`### Capítulo ${ch.number}: ${ch.title}`);
    lines.push(`*${ch.summary}*`);
    lines.push('');
    lines.push(ch.detailedContent);
    lines.push('');
  });
  lines.push(`## 3. Conceptos Clave`);
  (analysis.keyConcepts || []).forEach((c) => {
    lines.push(`### ${c.name} (${c.category} · ${c.importanceLevel})`);
    lines.push(c.definition);
    lines.push(`- **Ejemplo práctico:** ${c.practicalExample}`);
    lines.push('');
  });
  lines.push(`## 4. Flashcards de Estudio`);
  (analysis.flashcards || []).forEach((fc, idx) => {
    lines.push(`### Tarjeta ${idx + 1}: ${fc.front}`);
    lines.push(`- **Respuesta:** ${fc.back}`);
    lines.push(`- **Pista:** ${fc.mnemonicHint}`);
    lines.push('');
  });
  lines.push(`## 5. Cuestionario de Evaluación`);
  (analysis.quizzes || []).forEach((q, idx) => {
    lines.push(`### ${idx + 1}. ${q.question}`);
    (q.options || []).forEach((opt, oIdx) => {
      const mark = oIdx === q.correctIndex ? 'x' : ' ';
      lines.push(`- [${mark}] ${opt}`);
    });
    lines.push(`> **Explicación:** ${q.explanation}`);
    lines.push('');
  });
  lines.push(`## 6. Glosario`);
  (analysis.glossary || []).forEach((g) => {
    lines.push(`- **${g.term}** (*${g.category}*): ${g.definition}`);
  });

  return lines.join('\n');
}

export function generateWordDocExport(analysis: DocumentAnalysis): string {
  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(analysis.documentTitle)}</title>
  <style>
    body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.5; color: #111827; }
    h1 { font-size: 22pt; color: #1D4ED8; margin-bottom: 4pt; }
    h2 { font-size: 15pt; color: #1E293B; border-bottom: 1px solid #CBD5E1; padding-bottom: 3pt; margin-top: 18pt; }
    h3 { font-size: 12pt; color: #0F172A; margin-top: 12pt; }
    .callout { background: #EFF6FF; padding: 10pt; border-left: 3pt solid #1D4ED8; margin: 10pt 0; }
  </style>
</head>
<body>
  <p style="font-size:10pt; color:#2563EB; font-weight:bold;">🧠 JAIRRESTAURA IA DE ESTUDIO — Convierte cualquier documento en conocimiento inteligente</p>
  <h1>${escapeHtml(analysis.documentTitle)}</h1>
  <p><em>${escapeHtml(analysis.subtitle)}</em></p>
  <h2>1. Resumen Ejecutivo</h2>
  <div class="callout"><strong>Tesis Central:</strong> ${escapeHtml(analysis.executiveSummary.thesisStatement)}</div>
  <p>${escapeHtml(analysis.executiveSummary.overview)}</p>
  <h2>2. Capítulos</h2>
  ${(analysis.chapters || [])
    .map(
      (ch) => `
    <h3>Capítulo ${ch.number}: ${escapeHtml(ch.title)}</h3>
    <p><strong>Síntesis:</strong> ${escapeHtml(ch.summary)}</p>
    <p>${escapeHtml(ch.detailedContent)}</p>`
    )
    .join('')}
  <h2>3. Conceptos Clave</h2>
  ${(analysis.keyConcepts || [])
    .map(
      (c) => `
    <h3>${escapeHtml(c.name)} (${escapeHtml(c.category)})</h3>
    <p>${escapeHtml(c.definition)}</p>`
    )
    .join('')}
  <h2>4. Glosario</h2>
  ${(analysis.glossary || [])
    .map(
      (g) => `<p><strong>${escapeHtml(g.term)}</strong>: ${escapeHtml(g.definition)}</p>`
    )
    .join('')}
</body>
</html>`;
}

export async function generateFullSiteZipBlob(
  analysisInput?: DocumentAnalysis | null,
  theme: 'light' | 'dark' | 'editorial' = 'editorial'
): Promise<Blob> {
  const analysis = analysisInput || STARTER_STANDALONE_ANALYSIS;
  const bundle = buildWebBundle(analysis, theme);
  const zip = new JSZip();

  zip.file('index.html', bundle.fullStandaloneHtml);
  zip.file('style.css', bundle.css);
  zip.file('script.js', bundle.javascript);
  zip.file('documento.md', generateMarkdownExport(analysis));
  zip.file('documento.txt', generatePlainTextExport(analysis));

  const readme = `# ${analysis.documentTitle} — JAIRRESTAURA IA DE ESTUDIO (GitHub Pages)

> *"Convierte cualquier documento en conocimiento inteligente"*

Este paquete estático es **100% compatible con GitHub Pages** y no requiere ningún servidor backend.

## Archivos incluidos
- \`index.html\`: Aplicación web autocontenida con pantalla de bienvenida, Tour Guiado interactivo con overlay, carga de PDF/DOCX, IndexedDB, flashcards, cuestionarios y exportación PDF.
- \`style.css\`: Hoja de estilos con soporte de modo claro y oscuro.
- \`script.js\`: Motor interactivo en navegador.
- \`documento.md\` / \`documento.txt\`: Exportaciones directas del análisis.
`;

  zip.file('README.md', readme);
  return await zip.generateAsync({ type: 'blob' });
}

export async function generateLibraryBackupZipBlob(
  library: StoredDocumentRecord[]
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('jairrestaura_indexeddb_backup.json', JSON.stringify(library, null, 2));

  const docsFolder = zip.folder('documentos');
  for (const record of library) {
    const slug = record.id.replace(/[^a-z0-9-_]/gi, '_');
    const itemFolder = docsFolder?.folder(slug);
    if (itemFolder) {
      const bundle = buildWebBundle(record.analysis, 'editorial');
      itemFolder.file('index.html', bundle.fullStandaloneHtml);
      itemFolder.file('style.css', bundle.css);
      itemFolder.file('script.js', bundle.javascript);
      itemFolder.file(`${slug}.md`, generateMarkdownExport(record.analysis));
      itemFolder.file(`${slug}.txt`, generatePlainTextExport(record.analysis));
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
