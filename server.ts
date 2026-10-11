import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  /**
   * POST /api/tutor/ask
   * Recibe:
   * - question: pregunta actual del usuario
   * - structuredContext: { documentTitle, mainTopic, summary, relevantChapters, relatedConcepts, glossaryTerms }
   * - conversationHistory: memoria de hasta las últimas 20 interacciones persistidas en LocalStorage
   */
  app.post('/api/tutor/ask', async (req, res) => {
    try {
      const { question, structuredContext, conversationHistory } = req.body || {};
      if (!question || !structuredContext) {
        res.status(400).json({ error: 'Falta la pregunta o el contexto del documento.' });
        return;
      }

      const ai = getAiClient();

      // Mantener las últimas 20 interacciones de la conversación
      const recentHistory = Array.isArray(conversationHistory)
        ? conversationHistory.slice(-20)
        : [];

      const systemInstruction = `Eres un profesor universitario y pedagogo experto dentro de JAIRRESTAURA IA DE ESTUDIO.
Tu misión es responder la pregunta del estudiante basándote en el contexto relevante extraído del documento activo ("${structuredContext.documentTitle || 'Documento'}") y manteniendo plena MEMORIA CONVERSACIONAL de las interacciones previas.

REGLAS PEDAGÓGICAS Y DE MEMORIA CONVERSACIONAL ESTRICTAS:
1. MEMORIA DE SEGUIMIENTO (CORREFERENCIA): Lee atentamente el historial de conversación previo. Si el usuario hace una pregunta breve o de seguimiento con pronombres implícitos (por ejemplo, primero pregunta "¿Qué es la ansiedad?" y luego pregunta "¿Cómo se controla?", "¿Cuáles son sus síntomas?" o "Dame un ejemplo"), debes entender que "se" o "sus" hace referencia al concepto o sujeto mencionado en los turnos anteriores ("la ansiedad").
2. NUNCA devuelvas fragmentos crudos copiados, ni listas de capítulos ("Capítulo 1: ...", "Capítulo 2: ..."), ni índices completos, salvo que el usuario pida explícitamente la lista de capítulos o el índice.
3. Responde de forma clara, educativa, fluida y conversacional en prosa bien redactada (empezando por ejemplo con "Según el documento, ..." o conectando naturalmente con la pregunta previa).
4. Explica los conceptos difíciles con sencillez, conectando las ideas del resumen, los capítulos relevantes, los conceptos clave y el glosario proporcionados en el contexto.
5. Incluye un ejemplo práctico o aplicación cotidiana clara para afianzar el aprendizaje cuando sea pertinente.

DOCUMENTO ACTIVO EN CLASE:
- Título: ${structuredContext.documentTitle}
- Tema principal: ${structuredContext.mainTopic}

1. RESUMEN EJU-CUTIVO:
- Tesis central: ${structuredContext.summary?.thesisStatement || ''}
- Síntesis general: ${structuredContext.summary?.overview || ''}
- Hallazgos clave: ${(structuredContext.summary?.keyFindings || []).join(' | ')}

2. CAPÍTULOS MÁS RELEVANTES PARA LA CONVERSACIÓN ACTUAL:
${(structuredContext.relevantChapters || [])
  .map(
    (ch: any) =>
      `[Capítulo ${ch.number}: ${ch.title}]\nResumen: ${ch.summary}\nContenido clave: ${ch.detailedContent}\nConclusiones: ${(ch.keyTakeaways || []).join('; ')}`
  )
  .join('\n\n')}

3. CONCEPTOS CLAVE RELACIONADOS:
${(structuredContext.relatedConcepts || [])
  .map(
    (c: any) =>
      `- ${c.name} (${c.category}): ${c.definition}. Ejemplo práctico: ${c.practicalExample}`
  )
  .join('\n')}

4. GLOSARIO RELACIONADO:
${(structuredContext.glossaryTerms || [])
  .map((g: any) => `- ${g.term}: ${g.definition} (Contexto: ${g.contextUsage})`)
  .join('\n')}`;

      // Construir arreglo multi-turno real para Gemini con las últimas 20 interacciones
      const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

      for (const turn of recentHistory) {
        if (!turn || typeof turn.content !== 'string' || !turn.content.trim()) continue;
        // Omitir el saludo automático inicial si empieza con "¡Hola! Soy tu profesor" para no sesgar el formato JSON
        if (turn.role === 'assistant' && turn.content.startsWith('¡Hola! Soy tu profesor')) {
          continue;
        }
        contents.push({
          role: turn.role === 'user' ? 'user' : 'model',
          parts: [{ text: turn.content }],
        });
      }

      // Agregar el turno actual del usuario con recordatorio de formato JSON pedagógico
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Pregunta actual del estudiante (ten en cuenta los turnos anteriores si es una pregunta de seguimiento): "${question}"

Responde como profesor experto siguiendo todas las reglas pedagógicas y de memoria conversacional. Devuelve JSON con:
- "answer": tu explicación pedagógica conversacional, clara, conectada con el contexto previo y con ejemplo práctico.
- "citedSections": arreglo breve con los nombres de las secciones o conceptos de donde sintetizaste la respuesta (máximo 3).
- "followUpSuggestions": 3 preguntas interesantes de seguimiento para continuar la conversación.`,
          },
        ],
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description:
                  'Respuesta clara, educativa y conversacional de profesor experto con memoria de seguimiento.',
              },
              citedSections: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              followUpSuggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['answer', 'citedSections', 'followUpSuggestions'],
          },
          temperature: 0.35,
        },
      });

      const text = response.text;
      if (!text) {
        res.status(502).json({ error: 'Respuesta vacía del modelo Gemini.' });
        return;
      }

      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error: any) {
      console.error('Error in /api/tutor/ask:', error?.message || error);
      res.status(500).json({
        error: error?.message || 'Error al consultar el Tutor IA con Gemini.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JAIRRESTAURA IA DE ESTUDIO server running on http://localhost:${PORT}`);
  });
}

startServer();
