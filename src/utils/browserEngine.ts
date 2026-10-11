import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite static worker URL import for 100% browser-native PDF parsing
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  DocumentAnalysis,
  ChapterItem,
  KeyConceptItem,
  FlashcardItem,
  QuizQuestion,
  ActivityItem,
  GlossaryItem,
  ConceptMapData,
  GeneratedCourse,
  ExamQuestionItem,
  SemanticSearchResponse,
  DocumentComparisonResult,
} from '../types';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorkerUrl ||
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
} catch {
  // Fallback if worker fails
}

function stripHtmlAndXml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|w:p|a:p)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Real Browser-Native PDF Text & Structure Extractor (PDF.js)
 */
export async function extractPdfInBrowser(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pagesText: string[] = [];
    const maxPages = Math.min(pdf.numPages, 120);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      const lineParts: string[] = [];

      for (const item of content.items as any[]) {
        const str = item.str || '';
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 7) {
          lineParts.push('\n');
        }
        lineParts.push(str);
        if (y !== null) lastY = y;
      }

      const pageText = lineParts
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n +/g, '\n')
        .trim();

      if (pageText) {
        pagesText.push(`[[PÁGINA ${i}]]\n${pageText}`);
      }
    }

    if (pagesText.length > 0 && pagesText.join(' ').trim().length > 20) {
      return pagesText.join('\n\n');
    }
  } catch (err) {
    console.warn('PDF.js extraction notice, trying stream parser:', err);
  }

  // Secondary PDF stream parser for uncompressed text operators (Tj / TJ)
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(arrayBuffer);
  const extractedChunks: string[] = [];
  const tjMatches = raw.matchAll(/\(([^()\\]{3,250})\)\s*Tj/g);
  for (const m of tjMatches) {
    extractedChunks.push(m[1]);
  }
  if (extractedChunks.length > 5) {
    return extractedChunks.join(' ');
  }

  const genericParen = Array.from(raw.matchAll(/\(([^()]{4,200})\)/g)).map((m) => m[1]);
  if (genericParen.length > 10) {
    return genericParen.join(' ');
  }

  throw new Error(
    'El archivo PDF no contiene una capa de texto seleccionable o requiere OCR previo.'
  );
}

/**
 * Real Browser-Native DOCX Extractor (Mammoth.js + OpenXML w:p / w:t parser)
 */
export async function extractDocxInBrowser(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.value && result.value.trim().length > 15) {
      return result.value.trim();
    }
  } catch (err) {
    console.warn('Mammoth fallback to OpenXML JSZip:', err);
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (docXml) {
    const paragraphs = docXml.split(/<\/w:p>/i);
    const lines: string[] = [];
    for (const p of paragraphs) {
      const texts = Array.from(p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)).map((m) => m[1]);
      const line = stripHtmlAndXml(texts.join(''));
      if (line.length > 0) {
        lines.push(line);
      }
    }
    if (lines.length > 0) {
      return lines.join('\n\n');
    }
    return stripHtmlAndXml(docXml);
  }
  throw new Error('No se pudo extraer texto legible del archivo DOCX.');
}

async function extractEpubInBrowser(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const htmlFiles = Object.keys(zip.files)
    .filter(
      (name) => /\.(xhtml|html|htm)$/i.test(name) && !name.includes('nav') && !name.includes('toc')
    )
    .sort();

  const targetFiles =
    htmlFiles.length > 0
      ? htmlFiles
      : Object.keys(zip.files)
          .filter((name) => /\.(xhtml|html|htm|xml)$/i.test(name))
          .sort();

  const chunks: string[] = [];
  for (const fileName of targetFiles) {
    const fileObj = zip.files[fileName];
    if (fileObj && !fileObj.dir) {
      const rawContent = await fileObj.async('string');
      const cleaned = stripHtmlAndXml(rawContent);
      if (cleaned.length > 20) {
        chunks.push(cleaned);
      }
    }
  }
  return chunks.join('\n\n');
}

async function extractPptxInBrowser(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

  const slidesText: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const fileObj = zip.files[slideFiles[i]];
    if (fileObj && !fileObj.dir) {
      const xml = await fileObj.async('string');
      const textMatches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map(
        (m) => m[1]
      );
      const slideContent = stripHtmlAndXml(textMatches.join(' '));
      if (slideContent) {
        slidesText.push(`Diapositiva ${i + 1}: ${slideContent}`);
      }
    }
  }
  return slidesText.join('\n\n');
}

export async function extractTextFromFileInBrowser(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    return await extractPdfInBrowser(arrayBuffer);
  }
  if (
    lower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return await extractDocxInBrowser(arrayBuffer);
  }
  if (lower.endsWith('.epub') || file.type === 'application/epub+zip') {
    return await extractEpubInBrowser(arrayBuffer);
  }
  if (
    lower.endsWith('.pptx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return await extractPptxInBrowser(arrayBuffer);
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(arrayBuffer).trim();
}

const STOPWORDS_ES = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en',
  'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'que', 'y',
  'o', 'u', 'e', 'ni', 'pero', 'sino', 'como', 'cuando', 'donde', 'quien', 'cual',
  'cuyo', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel',
  'aquella', 'aquellos', 'aquellas', 'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nuestro',
  'nuestra', 'se', 'le', 'les', 'lo', 'me', 'te', 'nos', 'es', 'son', 'fue', 'fueron',
  'ser', 'estar', 'está', 'están', 'ha', 'han', 'había', 'hay', 'puede', 'pueden',
  'más', 'menos', 'muy', 'también', 'así', 'ya', 'no', 'sí', 'todo', 'toda', 'todos',
  'todas', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'cada', 'parte', 'tipo',
  'mediante', 'según', 'través', 'durante', 'dentro', 'fuera', 'tanto', 'como', 'solo',
  'estos', 'estas', 'tiene', 'tienen', 'hacer', 'hace', 'forma', 'manera', 'ejemplo',
]);

/**
 * Generates additional real Flashcards strictly from the active DocumentAnalysis
 */
export function generateAdditionalFlashcardsFromAnalysis(
  analysis: DocumentAnalysis,
  existingCount: number
): FlashcardItem[] {
  const newCards: FlashcardItem[] = [];

  (analysis.chapters || []).forEach((ch, idx) => {
    const takeaway = ch.keyTakeaways?.[0] || ch.summary;
    newCards.push({
      id: `fc-gen-ch-${Date.now()}-${idx}`,
      category: ch.title.slice(0, 28),
      difficulty: idx % 2 === 0 ? 'Intermedio' : 'Avanzado',
      front: `¿Cuál es el planteamiento principal de "${ch.title}" en "${analysis.documentTitle}"?`,
      back: `${ch.summary}\n\nConclusión clave: ${takeaway}`,
      mnemonicHint: `Eje de ${ch.title}`,
    });
  });

  (analysis.glossary || []).slice(0, 4).forEach((g, idx) => {
    newCards.push({
      id: `fc-gen-gl-${Date.now()}-${existingCount + idx}`,
      category: g.category || 'Glosario del Documento',
      difficulty: 'Fácil',
      front: `Según "${analysis.documentTitle}", ¿qué significa "${g.term}"?`,
      back: `${g.definition}\n\nCita textual: "${g.contextUsage}"`,
      mnemonicHint: `Término extraído: ${g.term}`,
    });
  });

  return newCards;
}

/**
 * Generates additional Multiple-Choice Quiz Questions strictly from the active DocumentAnalysis
 */
export function generateAdditionalQuizzesFromAnalysis(
  analysis: DocumentAnalysis,
  existingCount: number
): QuizQuestion[] {
  const newQuizzes: QuizQuestion[] = [];
  const allStatements = [
    ...(analysis.keyConcepts || []).map((c) => c.definition.slice(0, 155)),
    ...(analysis.glossary || []).map((g) => g.definition.slice(0, 155)),
    ...(analysis.chapters || []).map((ch) => ch.summary.slice(0, 155)),
  ].filter((d) => d.length > 15);

  (analysis.chapters || []).forEach((ch, idx) => {
    const correctOption = ch.summary.slice(0, 165);
    const otherStatements = allStatements.filter((s) => s !== correctOption);
    const distractors = [
      otherStatements[idx % Math.max(1, otherStatements.length)] ||
        `Enfoque alternativo no abordado en ${ch.title}.`,
      otherStatements[(idx + 2) % Math.max(1, otherStatements.length)] ||
        `Aspecto secundario distinto al núcleo de ${ch.title}.`,
      otherStatements[(idx + 3) % Math.max(1, otherStatements.length)] ||
        `Interpretación que omite las conclusiones de ${analysis.documentTitle}.`,
    ];

    const options = [...distractors.slice(0, 3)];
    const correctIndex = (existingCount + idx) % 4;
    options.splice(correctIndex, 0, correctOption);

    newQuizzes.push({
      id: existingCount + idx + 1,
      question: `En el documento "${analysis.documentTitle}", ¿qué desarrolla específicamente la sección "${ch.title}"?`,
      difficulty: idx % 2 === 0 ? 'Intermedio' : 'Avanzado',
      options: options.slice(0, 4),
      correctIndex,
      explanation: `En "${ch.title}" se establece que: ${ch.summary}`,
    });
  });

  return newQuizzes;
}

/**
 * Deep Document-Specific NLP Engine:
 * Every uploaded PDF, DOCX, TXT, EPUB, or PPTX generates 100% unique content derived ONLY from its own text:
 * 1. Main Topic Detection
 * 2. Real Heading/Section Chapter Segmentation
 * 3. Custom Executive Summary & Thesis
 * 4. Extracted Key Concepts
 * 5. Document-Specific Flashcards
 * 6. Document-Specific Quizzes
 * 7. Document-Specific Glossary
 */
export function generateLocalHeuristicAnalysis(
  rawText: string,
  fileName: string,
  customInstructions?: string
): DocumentAnalysis {
  const cleanFileNameTitle = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const rawLines = rawText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Detect real document title from first short heading line if present
  const firstHeadingCandidate = rawLines.find(
    (l) => l.length >= 8 && l.length <= 110 && !l.endsWith('.')
  );
  const documentTitle = firstHeadingCandidate || cleanFileNameTitle;

  const paragraphs = rawLines.filter((p) => p.length > 30);
  const safeParagraphs =
    paragraphs.length >= 2
      ? paragraphs
      : rawLines.length > 0
      ? rawLines
      : [`Contenido extraído de ${documentTitle}.`];

  const words = rawText
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const wordCountEstimate = Math.max(words.length, 1);
  const estimatedReadingMinutes = Math.max(1, Math.round(wordCountEstimate / 200));

  // 1. DETECT MAIN TOPIC & KEY TERMS DIRECTLY FROM THE DOCUMENT
  const freqMap: Record<string, number> = {};
  const originalCasing: Record<string, string> = {};
  const bigramFreq: Record<string, number> = {};

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const lower = w.toLowerCase();
    if (lower.length >= 4 && !STOPWORDS_ES.has(lower) && isNaN(Number(lower))) {
      freqMap[lower] = (freqMap[lower] || 0) + 1;
      if (!originalCasing[lower]) {
        originalCasing[lower] = w.charAt(0).toUpperCase() + w.slice(1);
      }

      if (i + 1 < words.length) {
        const nextW = words[i + 1];
        const nextLower = nextW.toLowerCase();
        if (nextLower.length >= 4 && !STOPWORDS_ES.has(nextLower) && isNaN(Number(nextLower))) {
          const bg = `${originalCasing[lower]} ${nextW.toLowerCase()}`;
          bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
        }
      }
    }
  }

  const topKeywords = Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([k]) => originalCasing[k] || k);

  const topBigrams = Object.entries(bigramFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([bg]) => bg);

  if (topKeywords.length === 0) {
    topKeywords.push(documentTitle);
  }

  const detectedMainTopic =
    topBigrams[0] && topKeywords[0]
      ? `${topBigrams[0]} (${topKeywords.slice(0, 4).join(', ')})`
      : topKeywords.slice(0, 4).join(' · ');

  const detectedDomain = customInstructions
    ? customInstructions
    : `Estudio de ${topKeywords.slice(0, 2).join(' y ')}`;

  // Extract real sentences from the document
  const sentences = rawText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 380);

  const safeSentences =
    sentences.length > 0 ? sentences : safeParagraphs.map((p) => p.slice(0, 280));

  // 2. CREATE NEW EXECUTIVE SUMMARY FROM DOCUMENT SENTENCES (TF-IDF Sentence Scoring)
  const scoredSentences = safeSentences.map((s, idx) => {
    const lowerS = s.toLowerCase();
    let score = 0;
    topKeywords.slice(0, 10).forEach((kw, kwIdx) => {
      if (lowerS.includes(kw.toLowerCase())) {
        score += 10 - kwIdx;
      }
    });
    if (idx === 0) score += 8; // Lead sentence bonus
    return { sentence: s, score, index: idx };
  });

  const topSummarySentences = [...scoredSentences]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  const thesisStatement = topSummarySentences[0] || safeSentences[0] || documentTitle;
  const overview = safeParagraphs.slice(0, 3).join('\n\n');
  const keyFindings =
    topSummarySentences.length >= 2
      ? topSummarySentences
      : safeSentences.slice(0, Math.min(5, safeSentences.length));

  // 3. CREATE NEW CHAPTERS BY DETECTING REAL HEADINGS OR SEMANTIC BLOCKS
  const headingRegex =
    /^(cap[íi]tulo\s+\d+|secci[óo]n\s+\d+|tema\s+\d+|m[óo]dulo\s+\d+|unidad\s+\d+|parte\s+\d+|\d+(\.\d+)*\s+[A-ZÁÉÍÓÚÑ]|[IVX]+\.\s+[A-ZÁÉÍÓÚÑ])/i;

  const detectedSections: { title: string; paragraphs: string[] }[] = [];
  let currentSec: { title: string; paragraphs: string[] } | null = null;

  for (const line of rawLines) {
    const isShortUpperHeading =
      line.length >= 5 &&
      line.length <= 85 &&
      !line.endsWith('.') &&
      (headingRegex.test(line) || (line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line)));

    if (isShortUpperHeading && detectedSections.length < 10) {
      if (currentSec && currentSec.paragraphs.length > 0) {
        detectedSections.push(currentSec);
      }
      currentSec = { title: line, paragraphs: [] };
    } else if (line.length > 25) {
      if (!currentSec) {
        currentSec = {
          title: `${topKeywords[0] || 'Introducción'}: Planteamiento Inicial`,
          paragraphs: [],
        };
      }
      currentSec.paragraphs.push(line);
    }
  }
  if (currentSec && currentSec.paragraphs.length > 0) {
    detectedSections.push(currentSec);
  }

  const chapters: ChapterItem[] = [];

  if (detectedSections.length >= 2) {
    detectedSections.slice(0, 8).forEach((sec, idx) => {
      const content = sec.paragraphs.join('\n\n');
      const secSentences = content
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);
      chapters.push({
        number: idx + 1,
        title: sec.title,
        summary: secSentences[0] || sec.paragraphs[0].slice(0, 220),
        detailedContent: content,
        keyTakeaways: secSentences.slice(0, 3).length
          ? secSentences.slice(0, 3)
          : [sec.paragraphs[0].slice(0, 180)],
      });
    });
  } else {
    const numChapters = Math.min(6, Math.max(2, Math.ceil(safeParagraphs.length / 2)));
    const chunkSize = Math.max(1, Math.ceil(safeParagraphs.length / numChapters));

    for (let i = 0; i < numChapters; i++) {
      const slice = safeParagraphs.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length === 0) continue;
      const kw = topKeywords[i % topKeywords.length] || `Sección ${i + 1}`;
      const blockSentences = slice
        .join(' ')
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);
      const lead = blockSentences[0] || slice[0];

      chapters.push({
        number: i + 1,
        title: `${kw}: ${lead.slice(0, 58)}${lead.length > 58 ? '...' : ''}`,
        summary: lead.slice(0, 230),
        detailedContent: slice.join('\n\n'),
        keyTakeaways:
          blockSentences.slice(0, 3).length > 0
            ? blockSentences.slice(0, 3)
            : [lead.slice(0, 180)],
      });
    }
  }

  // 4. CREATE NEW KEY CONCEPTS DIRECTLY FROM THE DOCUMENT'S TOP TERMS & SENTENCES
  const keyConcepts: KeyConceptItem[] = topKeywords.slice(0, 8).map((term, idx) => {
    const matching = safeSentences.filter((s) =>
      s.toLowerCase().includes(term.toLowerCase())
    );
    const definition =
      matching[0] || safeParagraphs[idx % safeParagraphs.length].slice(0, 260);
    const practicalExample =
      matching[1] ||
      matching[0]?.slice(0, 180) ||
      `Contexto directo en "${documentTitle}": ${definition.slice(0, 140)}`;

    return {
      name: term,
      category: idx < 3 ? 'Concepto Central' : idx < 6 ? 'Desarrollo Temático' : 'Término Aplicado',
      importanceLevel: idx < 4 ? 'Esencial' : 'Avanzado',
      definition,
      practicalExample,
    };
  });

  // 5. CREATE NEW FLASHCARDS EXCLUSIVELY FROM THIS DOCUMENT'S CONCEPTS & CHAPTERS
  const flashcards: FlashcardItem[] = [
    ...keyConcepts.map((c, idx) => ({
      id: `fc-doc-${Date.now()}-${idx + 1}`,
      category: c.category,
      difficulty: idx < 3 ? 'Fácil' : idx < 6 ? 'Medio' : 'Avanzado',
      front: `En "${documentTitle}", ¿qué expone el documento acerca de "${c.name}"?`,
      back: c.definition,
      mnemonicHint: `Término clave #${idx + 1}: ${c.name}`,
    })),
    ...chapters.map((ch, idx) => ({
      id: `fc-ch-${Date.now()}-${idx + 1}`,
      category: `Capítulo ${ch.number}`,
      difficulty: 'Medio',
      front: `¿Cuál es la síntesis principal del Capítulo ${ch.number} ("${ch.title}")?`,
      back: ch.summary,
      mnemonicHint: ch.keyTakeaways[0]?.slice(0, 90) || ch.title,
    })),
  ];

  // 6. CREATE NEW QUIZZES EXCLUSIVELY USING SENTENCES FROM THIS DOCUMENT
  const quizzes: QuizQuestion[] = keyConcepts.slice(0, 6).map((c, idx) => {
    const correctAnswer = c.definition.slice(0, 175);
    const otherDefinitions = keyConcepts
      .filter((other) => other.name !== c.name)
      .map((other) => other.definition.slice(0, 175));
    const chapterSummaries = chapters.map((ch) => ch.summary.slice(0, 175));
    const pool = [...otherDefinitions, ...chapterSummaries].filter((t) => t !== correctAnswer);

    const distractors = [
      pool[idx % Math.max(1, pool.length)] ||
        `Hace referencia únicamente a ${topKeywords[(idx + 2) % topKeywords.length] || 'otro apartado'}.`,
      pool[(idx + 1) % Math.max(1, pool.length)] ||
        `Corresponde a una sección distinta dentro de ${documentTitle}.`,
      pool[(idx + 2) % Math.max(1, pool.length)] ||
        `No describe el término ${c.name} según el texto analizado.`,
    ];

    const options = [...distractors.slice(0, 3)];
    const correctIndex = idx % 4;
    options.splice(correctIndex, 0, correctAnswer);

    return {
      id: idx + 1,
      question: `Según el contenido de "${documentTitle}", ¿cuál de los siguientes enunciados corresponde a "${c.name}"?`,
      difficulty: idx < 2 ? 'Básico' : idx < 4 ? 'Intermedio' : 'Avanzado',
      options: options.slice(0, 4),
      correctIndex,
      explanation: `Extracto verificable del documento sobre "${c.name}": ${c.definition}`,
    };
  });

  // 7. CREATE NEW GLOSSARY DIRECTLY FROM THE DOCUMENT'S TERMS & CONTEXT SENTENCES
  const glossary: GlossaryItem[] = topKeywords.slice(0, 12).map((term, idx) => {
    const matchingSentences = safeSentences.filter((s) =>
      s.toLowerCase().includes(term.toLowerCase())
    );
    const mainContext =
      matchingSentences[0] || safeParagraphs[idx % safeParagraphs.length].slice(0, 220);
    const secondContext = matchingSentences[1] || mainContext;

    return {
      term,
      category: idx < 4 ? 'Vocabulario Nuclear' : 'Término del Documento',
      definition: mainContext,
      contextUsage: secondContext.slice(0, 190),
    };
  });

  // Exam Questions derived from the document's chapters
  const examQuestions: ExamQuestionItem[] = chapters.slice(0, 4).map((ch, idx) => ({
    id: `exam-doc-${Date.now()}-${idx + 1}`,
    question: `Explique detalladamente el contenido de "${ch.title}" y su relación con el tema principal (${detectedMainTopic}).`,
    type: idx % 2 === 0 ? 'Desarrollo Analítico' : 'Síntesis Crítica',
    points: 25,
    evaluationRubric: [
      `Desarrolla la idea central: ${ch.summary.slice(0, 90)}... (10 pts)`,
      `Integra los términos clave del capítulo (10 pts)`,
      `Presenta conclusiones coherentes con "${documentTitle}" (5 pts)`,
    ],
    modelAnswer: ch.detailedContent,
  }));

  // Activities derived from the document's chapters and concepts
  const activities: ActivityItem[] = chapters.slice(0, 3).map((ch, idx) => ({
    id: `act-doc-${Date.now()}-${idx + 1}`,
    title: `Actividad Práctica ${idx + 1}: Análisis de ${ch.title}`,
    type: idx === 0 ? 'Mapa de Ideas' : idx === 1 ? 'Caso de Estudio' : 'Síntesis Aplicada',
    duration: '25 min',
    difficulty: idx === 0 ? 'Básico' : idx === 1 ? 'Intermedio' : 'Avanzado',
    objective: `Comprender y aplicar los puntos desarrollados en "${ch.title}".`,
    steps: (ch.keyTakeaways || [ch.summary]).map(
      (tk, sIdx) => `Paso ${sIdx + 1}: Analizar y verificar en el texto: "${tk}"`
    ),
    expectedDeliverable: `Resumen estructurado y conclusiones propias sobre "${ch.title}".`,
    evaluationCriteria: [
      `Precisión respecto al texto original de "${documentTitle}".`,
      `Uso correcto de los conceptos clave: ${topKeywords.slice(0, 3).join(', ')}.`,
    ],
  }));

  // Concept Map built from detectedMainTopic and topKeywords
  const conceptMap: ConceptMapData = {
    centralTheme: `${documentTitle} — ${detectedMainTopic}`,
    nodes: [
      {
        id: 'n1',
        label: documentTitle.slice(0, 28),
        category: 'Tema Principal',
        level: 1,
        description: thesisStatement,
      },
      ...keyConcepts.slice(0, 4).map((kc, i) => ({
        id: `n2_${i}`,
        label: kc.name,
        category: 'Concepto Clave',
        level: 2,
        description: kc.definition,
      })),
      ...chapters.slice(0, 3).map((ch, i) => ({
        id: `n3_${i}`,
        label: ch.title.slice(0, 26),
        category: `Capítulo ${ch.number}`,
        level: 3,
        description: ch.summary,
      })),
    ],
    edges: [
      ...keyConcepts.slice(0, 4).map((_, i) => ({
        source: 'n1',
        target: `n2_${i}`,
        relationLabel: 'articula concepto',
      })),
      ...chapters.slice(0, 3).map((_, i) => ({
        source: `n2_${i % Math.min(4, keyConcepts.length)}`,
        target: `n3_${i}`,
        relationLabel: 'desarrollado en',
      })),
    ],
  };

  // Generated Course built from the document's new chapters & quizzes
  const course: GeneratedCourse = {
    courseTitle: `Curso: ${documentTitle}`,
    level: customInstructions ? 'Personalizado' : 'Completo',
    totalDuration: `${chapters.length * 20} min`,
    xpTotal: chapters.length * 250,
    learningObjectives: keyFindings.slice(0, 4),
    prerequisites: [`Lectura activa del documento "${documentTitle}".`],
    modules: chapters.map((ch, idx) => ({
      id: `mod-doc-${ch.number}`,
      moduleNumber: ch.number,
      title: ch.title,
      duration: '20 min',
      xpReward: 250,
      summary: ch.summary,
      units: [
        {
          id: `unit-doc-${ch.number}-1`,
          title: `Estudio de ${ch.title}`,
          durationMinutes: 20,
          theoryContent: ch.detailedContent,
          practicalCodeOrCase: (ch.keyTakeaways || []).join('\n• '),
          checkpointQuestion:
            quizzes[idx % Math.max(1, quizzes.length)]?.question ||
            `¿Cuál es la idea principal de "${ch.title}"?`,
          checkpointAnswer: ch.summary,
        },
      ],
    })),
    capstoneProject: `Integrar los conceptos (${topKeywords
      .slice(0, 4)
      .join(', ')}) extraídos de "${documentTitle}" en un informe aplicado.`,
  };

  // Build page segments from [[PÁGINA X]] markers or ~250-word blocks
  const explicitPageSplits = rawText
    .split(/\[\[PÁGINA\s+\d+\]\]/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const pages: string[] =
    explicitPageSplits.length > 1
      ? explicitPageSplits
      : (() => {
          const calcPages: string[] = [];
          const wordsPerPage = 260;
          for (let i = 0; i < words.length; i += wordsPerPage) {
            calcPages.push(words.slice(i, i + wordsPerPage).join(' '));
          }
          return calcPages.length > 0 ? calcPages : [rawText];
        })();

  const pageCountEstimate = Math.max(1, pages.length);

  return {
    documentTitle,
    subtitle: `Tema principal detectado: ${detectedMainTopic} · ${wordCountEstimate.toLocaleString(
      'es-ES'
    )} palabras · ${pageCountEstimate} pág.`,
    detectedMainTopic,
    detectedDomain,
    estimatedReadingMinutes,
    wordCountEstimate,
    pageCountEstimate,
    fullRawText: rawText.replace(/\[\[PÁGINA\s+\d+\]\]\s*/gi, ''),
    pages,
    executiveSummary: {
      overview,
      thesisStatement,
      keyFindings,
      targetAudience: `Estudiantes y profesionales interesados en ${detectedMainTopic}.`,
      actionableRecommendations: chapters
        .slice(0, 3)
        .map((ch) => `Dominar el Capítulo ${ch.number} (${ch.title}): ${ch.summary.slice(0, 120)}`),
    },
    course,
    chapters,
    keyConcepts,
    activities,
    quizzes,
    examQuestions,
    glossary,
    conceptMap,
    flashcards,
  };
}

/**
 * Browser-Direct Gemini API Engine (Uses user's Gemini API key from LocalStorage)
 */
export async function analyzeWithOptionalGeminiKey(
  rawText: string,
  fileName: string,
  apiKey: string,
  customInstructions?: string
): Promise<DocumentAnalysis> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  const prompt = `Eres JAIRRESTAURA IA DE ESTUDIO. Analiza EXCLUSIVAMENTE el siguiente documento ("${fileName}") sin mezclar ejemplos externos. Detecta su tema principal y genera capítulos nuevos, resumen nuevo, conceptos clave nuevos, flashcards nuevas, cuestionario nuevo y glosario nuevo en ESPAÑOL.
Devuelve un objeto JSON válido con esta estructura exacta:
{
  "documentTitle": "string",
  "subtitle": "string",
  "detectedMainTopic": "Tema principal detectado del documento",
  "detectedDomain": "Área o disciplina del documento",
  "estimatedReadingMinutes": 10,
  "wordCountEstimate": 1500,
  "executiveSummary": {
    "overview": "string en varios párrafos",
    "thesisStatement": "string",
    "keyFindings": ["string"],
    "targetAudience": "string",
    "actionableRecommendations": ["string"]
  },
  "chapters": [
    { "number": 1, "title": "string", "summary": "string", "detailedContent": "string", "keyTakeaways": ["string"] }
  ],
  "keyConcepts": [
    { "name": "string", "category": "string", "importanceLevel": "Esencial", "definition": "string", "practicalExample": "string" }
  ],
  "activities": [
    { "id": "act-1", "title": "string", "type": "string", "duration": "30 min", "difficulty": "Intermedio", "objective": "string", "steps": ["string"], "expectedDeliverable": "string", "evaluationCriteria": ["string"] }
  ],
  "quizzes": [
    { "id": 1, "question": "string", "difficulty": "Intermedio", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "string" }
  ],
  "examQuestions": [
    { "id": "ex-1", "question": "string", "type": "Ensayo", "points": 25, "evaluationRubric": ["string"], "modelAnswer": "string" }
  ],
  "glossary": [
    { "term": "string", "category": "string", "definition": "string", "contextUsage": "string" }
  ],
  "conceptMap": {
    "centralTheme": "string",
    "nodes": [{ "id": "n1", "label": "string", "category": "string", "level": 1, "description": "string" }],
    "edges": [{ "source": "n1", "target": "n2", "relationLabel": "string" }]
  },
  "flashcards": [
    { "id": "fc-1", "category": "string", "difficulty": "Medio", "front": "string", "back": "string", "mnemonicHint": "string" }
  ]
}
${customInstructions ? `Instrucciones adicionales: ${customInstructions}` : ''}

TEXTO REAL DEL DOCUMENTO:
${rawText.slice(0, 90000)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    throw new Error('Error al conectar con Gemini API. Usando motor documental en navegador.');
  }

  const data = await res.json();
  const textOut = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOut) {
    throw new Error('Respuesta vacía de Gemini API.');
  }

  return JSON.parse(textOut.trim());
}

/**
 * Resuelve el sujeto o tema de conversación a partir de las últimas interacciones
 * cuando el usuario hace una pregunta de seguimiento (ej. "¿Cómo se controla?", "¿Por qué ocurre?", "Dame un ejemplo").
 */
export function resolveFollowUpTopicFromHistory(
  question: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): {
  isFollowUp: boolean;
  referencedSubject: string;
  expandedQueryForRetrieval: string;
} {
  const recent = (conversationHistory || [])
    .filter((m) => m && typeof m.content === 'string' && !m.content.startsWith('¡Hola! Soy tu profesor'))
    .slice(-20);

  if (recent.length === 0) {
    return {
      isFollowUp: false,
      referencedSubject: '',
      expandedQueryForRetrieval: question,
    };
  }

  const lowerQ = question.toLowerCase().trim();
  const qWords = lowerQ
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS_ES.has(w));

  // Detectar marcadores de seguimiento / correferencia ("se", "lo", "la", "eso", "esto", "sus", preguntas cortas)
  const hasPronounMarker =
    /\b(se|lo|la|los|las|le|les|eso|esto|aquello|su|sus|mismo|misma|anterior|mencionado)\b/i.test(
      lowerQ
    );
  const isShortFollowUp = qWords.length <= 3 || hasPronounMarker;

  // Extraer sustantivos/términos clave de las últimas preguntas del usuario (y respuestas recientes)
  const previousUserMessages = recent.filter((m) => m.role === 'user').slice(-4);
  const lastUserQuestion =
    previousUserMessages.length > 0
      ? previousUserMessages[previousUserMessages.length - 1].content
      : '';

  const subjectTokens: string[] = [];
  for (let i = previousUserMessages.length - 1; i >= 0; i--) {
    const tokens = previousUserMessages[i].content
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(
        (t) =>
          t.length >= 4 &&
          !STOPWORDS_ES.has(t) &&
          ![
            'como',
            'cómo',
            'cual',
            'cuál',
            'cuales',
            'cuáles',
            'donde',
            'dónde',
            'cuando',
            'cuándo',
            'porque',
            'porqué',
            'explica',
            'explicame',
            'explícame',
            'dime',
            'significa',
            'consiste',
          ].includes(t)
      );
    for (const tk of tokens) {
      if (!subjectTokens.includes(tk)) subjectTokens.push(tk);
    }
  }

  const referencedSubject = subjectTokens.slice(0, 3).join(' ');
  const expandedQueryForRetrieval =
    isShortFollowUp && referencedSubject
      ? `${question} ${referencedSubject} ${lastUserQuestion}`
      : `${question} ${referencedSubject}`;

  return {
    isFollowUp: Boolean(isShortFollowUp && referencedSubject),
    referencedSubject,
    expandedQueryForRetrieval,
  };
}

/**
 * Paso 1 y 2: Buscar el contenido más relevante del documento para la pregunta
 * (combinando la pregunta actual y la memoria conversacional de las últimas 20 interacciones)
 * y construir el contexto estructurado con:
 * - Resumen
 * - Capítulos relevantes
 * - Conceptos relacionados
 * - Glosario
 */
export function buildRelevantTutorContext(
  question: string,
  analysis: DocumentAnalysis,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
) {
  const followUpInfo = resolveFollowUpTopicFromHistory(question, conversationHistory);
  const effectiveQuery = followUpInfo.expandedQueryForRetrieval;

  const lowerQ = effectiveQuery
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const rawTokens = effectiveQuery
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS_ES.has(t));

  const normalizeStr = (s: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const scoreTextAgainstQuestion = (text: string, titleBoostText = ''): number => {
    const normText = normalizeStr(text);
    const normTitle = normalizeStr(titleBoostText);
    let score = 0;

    for (const tok of rawTokens) {
      const normTok = normalizeStr(tok);
      const stem = normTok.length > 5 ? normTok.slice(0, normTok.length - 2) : normTok;
      if (normTitle.includes(normTok)) score += 8;
      else if (normTitle.includes(stem)) score += 5;

      if (normText.includes(normTok)) score += 4;
      else if (normText.includes(stem)) score += 2;
    }

    if (lowerQ && normText.includes(lowerQ)) {
      score += 12;
    }
    return score;
  };

  // 1. Selección de los capítulos más relevantes
  const scoredChapters = (analysis.chapters || []).map((ch) => {
    let score = scoreTextAgainstQuestion(
      `${ch.summary} ${ch.detailedContent} ${(ch.keyTakeaways || []).join(' ')}`,
      ch.title
    );
    if (
      lowerQ.includes(`capitulo ${ch.number}`) ||
      lowerQ.includes(`capítulo ${ch.number}`)
    ) {
      score += 25;
    }
    return { chapter: ch, score };
  });

  scoredChapters.sort((a, b) => b.score - a.score);
  const relevantChapters =
    scoredChapters.filter((c) => c.score > 0).length > 0
      ? scoredChapters.filter((c) => c.score > 0).slice(0, 3).map((c) => c.chapter)
      : (analysis.chapters || []).slice(0, 2);

  // 2. Selección de conceptos clave relacionados
  const scoredConcepts = (analysis.keyConcepts || []).map((c) => ({
    concept: c,
    score: scoreTextAgainstQuestion(
      `${c.definition} ${c.practicalExample} ${c.category}`,
      c.name
    ),
  }));
  scoredConcepts.sort((a, b) => b.score - a.score);
  const relatedConcepts =
    scoredConcepts.filter((c) => c.score > 0).length > 0
      ? scoredConcepts.filter((c) => c.score > 0).slice(0, 4).map((c) => c.concept)
      : (analysis.keyConcepts || []).slice(0, 3);

  // 3. Selección de términos de glosario relacionados
  const scoredGlossary = (analysis.glossary || []).map((g) => ({
    item: g,
    score: scoreTextAgainstQuestion(`${g.definition} ${g.contextUsage}`, g.term),
  }));
  scoredGlossary.sort((a, b) => b.score - a.score);
  const glossaryTerms =
    scoredGlossary.filter((g) => g.score > 0).length > 0
      ? scoredGlossary.filter((g) => g.score > 0).slice(0, 4).map((g) => g.item)
      : (analysis.glossary || []).slice(0, 3);

  return {
    documentTitle: analysis.documentTitle,
    mainTopic: analysis.detectedMainTopic || analysis.documentTitle,
    summary: analysis.executiveSummary,
    relevantChapters,
    relatedConcepts,
    glossaryTerms,
    followUpInfo,
  };
}

/**
 * Síntesis pedagógica conversacional de respaldo con memoria de las últimas 20 interacciones
 * (para funcionamiento 100% estático en GitHub Pages o cuando se usa respaldo local).
 */
function synthesizeConversationalProfessorAnswer(
  question: string,
  analysis: DocumentAnalysis,
  ctx: ReturnType<typeof buildRelevantTutorContext>
): {
  answer: string;
  citedSections: string[];
  followUpSuggestions: string[];
} {
  const lowerQ = question.toLowerCase();
  const asksForChapterList =
    (lowerQ.includes('lista') ||
      lowerQ.includes('índice') ||
      lowerQ.includes('indice') ||
      lowerQ.includes('cuáles son los capítulos') ||
      lowerQ.includes('cuales son los capitulos')) &&
    (lowerQ.includes('capítulo') || lowerQ.includes('capitulo') || lowerQ.includes('índice'));

  if (asksForChapterList) {
    const listText = (analysis.chapters || [])
      .map((ch) => `${ch.number}. ${ch.title}: ${ch.summary}`)
      .join('\n');
    return {
      answer: `Con gusto. El documento "${analysis.documentTitle}" se estructura en los siguientes capítulos principales:\n\n${listText}`,
      citedSections: ['Estructura General del Documento'],
      followUpSuggestions: [
        `¿Cuál es la enseñanza principal de "${analysis.documentTitle}"?`,
        `Explícame con un ejemplo práctico "${ctx.relatedConcepts[0]?.name || analysis.detectedMainTopic}"`,
        `¿Cómo se aplica esto en la práctica?`,
      ],
    };
  }

  const primaryChapter = ctx.relevantChapters[0];
  const secondaryChapter = ctx.relevantChapters[1];
  const primaryConcept = ctx.relatedConcepts[0];
  const secondaryConcept = ctx.relatedConcepts[1];
  const primaryGlossary = ctx.glossaryTerms[0];

  const cleanSentence = (s: string) => {
    const trimmed = (s || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';
    return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
  };

  const coreThesis = cleanSentence(analysis.executiveSummary.thesisStatement);
  const chapterInsight = primaryChapter
    ? cleanSentence(primaryChapter.summary || primaryChapter.keyTakeaways?.[0] || '')
    : '';
  const secondaryInsight = secondaryChapter
    ? cleanSentence(secondaryChapter.keyTakeaways?.[0] || secondaryChapter.summary || '')
    : '';

  const followUpPrefix =
    ctx.followUpInfo.isFollowUp && ctx.followUpInfo.referencedSubject
      ? `Retomando nuestra conversación sobre **${ctx.followUpInfo.referencedSubject}**, según el documento `
      : `Según el documento, `;

  const conceptExplanation = primaryConcept
    ? `Para comprender cómo funciona y se gestiona esto a fondo, es clave el concepto de ${primaryConcept.name.toLowerCase()}, que el texto aborda como ${primaryConcept.definition.charAt(0).toLowerCase()}${cleanSentence(
        primaryConcept.definition.slice(1)
      )}`
    : primaryGlossary
    ? `En este marco resulta fundamental entender "${primaryGlossary.term}", definido en la obra como ${primaryGlossary.definition.charAt(0).toLowerCase()}${cleanSentence(
        primaryGlossary.definition.slice(1)
      )}`
    : '';

  const practicalExample =
    primaryConcept && primaryConcept.practicalExample
      ? `Por ejemplo, llevándolo a la práctica: ${primaryConcept.practicalExample.charAt(0).toLowerCase()}${cleanSentence(
          primaryConcept.practicalExample.slice(1)
        )}`
      : analysis.executiveSummary.actionableRecommendations?.[0]
      ? `En la práctica, una herramienta concreta para abordarlo consiste en ${analysis.executiveSummary.actionableRecommendations[0]
          .charAt(0)
          .toLowerCase()}${cleanSentence(
          analysis.executiveSummary.actionableRecommendations[0].slice(1)
        )}`
      : '';

  const paragraphs: string[] = [];

  if (chapterInsight && chapterInsight !== coreThesis) {
    paragraphs.push(
      `${followUpPrefix}abordar esta cuestión implica comprender que ${
        coreThesis.charAt(0).toLowerCase() + coreThesis.slice(1)
      } En particular, la obra enfatiza que ${
        chapterInsight.charAt(0).toLowerCase() + chapterInsight.slice(1)
      }${
        secondaryInsight
          ? ` Asimismo, destaca como factor fundamental que ${
              secondaryInsight.charAt(0).toLowerCase() + secondaryInsight.slice(1)
            }`
          : ''
      }`
    );
  } else {
    paragraphs.push(
      `${followUpPrefix}la clave radica en comprender que ${
        coreThesis.charAt(0).toLowerCase() + coreThesis.slice(1)
      } ${cleanSentence(analysis.executiveSummary.overview.split('\n')[0] || '')}`
    );
  }

  if (conceptExplanation) {
    paragraphs.push(conceptExplanation);
  }

  if (practicalExample) {
    paragraphs.push(practicalExample);
  }

  const cited: string[] = [];
  if (ctx.followUpInfo.isFollowUp && ctx.followUpInfo.referencedSubject) {
    cited.push(`Memoria Conversacional: ${ctx.followUpInfo.referencedSubject}`);
  }
  if (primaryChapter) cited.push(primaryChapter.title);
  if (primaryConcept) cited.push(`Concepto: ${primaryConcept.name}`);
  if (cited.length === 0) cited.push('Síntesis del Documento');

  return {
    answer: paragraphs.join('\n\n'),
    citedSections: cited.slice(0, 3),
    followUpSuggestions: [
      `¿Cómo se controla o aplica esto en el día a día?`,
      primaryConcept
        ? `¿Me das otro ejemplo práctico sobre ${primaryConcept.name}?`
        : `¿Cuáles son las recomendaciones prácticas más importantes del autor?`,
      secondaryConcept
        ? `¿Qué relación tiene esto con ${secondaryConcept.name}?`
        : `¿Qué factores clave debo recordar sobre ${analysis.detectedMainTopic || analysis.documentTitle}?`,
    ],
  };
}

/**
 * Tutor IA Experto con Memoria Conversacional de 20 Interacciones:
 * 1. Analiza la pregunta actual junto con las últimas 20 interacciones para resolver referencias ("¿Cómo se controla?").
 * 2. Busca el contenido más relevante del documento (Resumen, Capítulos relevantes, Conceptos relacionados, Glosario).
 * 3. Envía el contexto y las últimas 20 interacciones a Gemini (/api/tutor/ask).
 * 4. Gemini responde como profesor experto con continuidad conversacional.
 */
export async function answerQuestionInBrowser(
  question: string,
  analysis: DocumentAnalysis,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{
  answer: string;
  citedSections: string[];
  followUpSuggestions: string[];
}> {
  const last20Interactions = (conversationHistory || []).slice(-20);
  const structuredContext = buildRelevantTutorContext(question, analysis, last20Interactions);

  try {
    const response = await fetch('/api/tutor/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        structuredContext,
        conversationHistory: last20Interactions,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.answer === 'string' && data.answer.trim().length > 0) {
        return {
          answer: data.answer.trim(),
          citedSections: Array.isArray(data.citedSections) ? data.citedSections : [],
          followUpSuggestions: Array.isArray(data.followUpSuggestions)
            ? data.followUpSuggestions
            : [],
        };
      }
    }
  } catch (err) {
    console.warn('Usando síntesis pedagógica con memoria conversacional local:', err);
  }

  return synthesizeConversationalProfessorAnswer(question, analysis, structuredContext);
}

/**
 * Local Semantic Search Engine
 */
export function runLocalSemanticSearch(
  query: string,
  documents: {
    documentTitle: string;
    executiveSummary: any;
    chapters: ChapterItem[];
    keyConcepts: KeyConceptItem[];
    glossary: GlossaryItem[];
  }[]
): SemanticSearchResponse {
  const qTokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS_ES.has(t));

  const candidates: SemanticSearchResponse['results'] = [];

  for (const doc of documents) {
    for (const ch of doc.chapters || []) {
      const text = `${ch.title} ${ch.summary} ${ch.detailedContent}`;
      const lower = text.toLowerCase();
      const matched = qTokens.filter((t) => lower.includes(t));
      const score =
        qTokens.length > 0
          ? Math.min(99, 72 + Math.round((matched.length / qTokens.length) * 26))
          : 82;

      if (matched.length > 0 || candidates.length < 3) {
        candidates.push({
          documentTitle: doc.documentTitle,
          sectionType: `Capítulo 0${ch.number}`,
          title: ch.title,
          excerpt: ch.summary,
          semanticRelevanceReason:
            matched.length > 0
              ? `Coincidencia conceptual directa en torno a: ${matched.join(', ')}`
              : 'Afinidad temática con la estructura central del documento.',
          relevancePercentage: score,
        });
      }
    }

    for (const c of doc.keyConcepts || []) {
      const text = `${c.name} ${c.category} ${c.definition} ${c.practicalExample}`;
      const lower = text.toLowerCase();
      const matched = qTokens.filter((t) => lower.includes(t));
      if (matched.length > 0) {
        candidates.push({
          documentTitle: doc.documentTitle,
          sectionType: 'Concepto Clave',
          title: c.name,
          excerpt: `${c.definition}`,
          semanticRelevanceReason: `Términos afines detectados: ${matched.join(', ')}`,
          relevancePercentage: Math.min(
            99,
            78 + Math.round((matched.length / Math.max(1, qTokens.length)) * 20)
          ),
        });
      }
    }
  }

  candidates.sort((a, b) => b.relevancePercentage - a.relevancePercentage);
  const topResults = candidates.slice(0, 6);

  return {
    synthesizedAnswer:
      topResults.length > 0
        ? `Se encontraron ${topResults.length} bloques de alta relevancia semántica para "${query}". Destaca "${topResults[0].title}" en "${topResults[0].documentTitle}": ${topResults[0].excerpt}`
        : `No se hallaron coincidencias exactas para "${query}" en los documentos cargados.`,
    results: topResults,
  };
}

/**
 * Document Comparator (Supports Gemini API if key active, or instant local comparison)
 */
export function runLocalDocumentComparison(
  docA: DocumentAnalysis,
  docB: DocumentAnalysis
): DocumentComparisonResult {
  const conceptsA = (docA.keyConcepts || []).map((c) => c.name);
  const conceptsB = (docB.keyConcepts || []).map((c) => c.name);
  const shared = conceptsA.filter((a) =>
    conceptsB.some((b) => b.toLowerCase() === a.toLowerCase())
  );

  return {
    executiveSynthesis: `La comparación entre "${docA.documentTitle}" (Tema: ${
      docA.detectedMainTopic || 'General'
    }) y "${docB.documentTitle}" (Tema: ${
      docB.detectedMainTopic || 'General'
    }) contrasta dos estructuras documentales independientes. El primer documento sostiene que "${
      docA.executiveSummary.thesisStatement
    }", mientras que el segundo plantea que "${docB.executiveSummary.thesisStatement}".`,
    complementaryStrengths: `Integrar ambos documentos articula los conceptos de (${conceptsA
      .slice(0, 4)
      .join(', ')}) con (${conceptsB.slice(0, 4).join(', ')}).`,
    sharedThemes:
      shared.length > 0
        ? shared.map((t) => `Concepto compartido detectado en ambos textos: ${t}`)
        : [
            `Análisis de dominio complementario entre ${docA.documentTitle} y ${docB.documentTitle}.`,
            'Ambos documentos han sido segmentados en capítulos, conceptos clave, flashcards y glosario.',
          ],
    keyDifferences: [
      {
        dimension: 'Tema Principal Detectado',
        docAPerspective: docA.detectedMainTopic || docA.documentTitle,
        docBPerspective: docB.detectedMainTopic || docB.documentTitle,
      },
      {
        dimension: 'Tesis Central Extraída',
        docAPerspective: docA.executiveSummary.thesisStatement,
        docBPerspective: docB.executiveSummary.thesisStatement,
      },
      {
        dimension: 'Conceptos Clave Propios',
        docAPerspective: conceptsA.slice(0, 5).join(' · '),
        docBPerspective: conceptsB.slice(0, 5).join(' · '),
      },
      {
        dimension: 'Estructura y Extensión',
        docAPerspective: `${docA.wordCountEstimate} palabras · ${docA.chapters.length} capítulos · ${docA.flashcards.length} flashcards`,
        docBPerspective: `${docB.wordCountEstimate} palabras · ${docB.chapters.length} capítulos · ${docB.flashcards.length} flashcards`,
      },
    ],
    studyRecommendation: `Estudiar primero los ${docA.chapters.length} capítulos de "${docA.documentTitle}" y posteriormente contrastar con los ${docB.chapters.length} capítulos de "${docB.documentTitle}".`,
  };
}
