export interface ExecutiveSummary {
  overview: string;
  thesisStatement: string;
  keyFindings: string[];
  targetAudience: string;
  actionableRecommendations: string[];
}

export interface CourseUnit {
  id: string;
  title: string;
  durationMinutes: number;
  theoryContent: string;
  practicalCodeOrCase: string;
  checkpointQuestion: string;
  checkpointAnswer: string;
}

export interface CourseModule {
  id: string;
  moduleNumber: number;
  title: string;
  duration: string;
  xpReward: number;
  summary: string;
  units: CourseUnit[];
}

export interface GeneratedCourse {
  courseTitle: string;
  level: string;
  totalDuration: string;
  xpTotal: number;
  learningObjectives: string[];
  prerequisites: string[];
  modules: CourseModule[];
  capstoneProject: string;
}

export interface ChapterItem {
  number: number;
  title: string;
  summary: string;
  detailedContent: string;
  keyTakeaways: string[];
}

export interface KeyConceptItem {
  name: string;
  category: string;
  importanceLevel: string;
  definition: string;
  practicalExample: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  type: string;
  duration: string;
  difficulty: string;
  objective: string;
  steps: string[];
  expectedDeliverable: string;
  evaluationCriteria: string[];
}

export interface QuizQuestion {
  id: number;
  question: string;
  difficulty: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ExamQuestionItem {
  id: string;
  question: string;
  type: string;
  points: number;
  evaluationRubric: string[];
  modelAnswer: string;
}

export interface GlossaryItem {
  term: string;
  category: string;
  definition: string;
  contextUsage: string;
}

export interface ConceptNode {
  id: string;
  label: string;
  category: string;
  level: number;
  description: string;
}

export interface ConceptEdge {
  source: string;
  target: string;
  relationLabel: string;
}

export interface ConceptMapData {
  centralTheme: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

export interface FlashcardItem {
  id: string;
  category: string;
  difficulty: string;
  front: string;
  back: string;
  mnemonicHint: string;
}

export interface DocumentAnalysis {
  documentTitle: string;
  subtitle: string;
  detectedMainTopic?: string;
  detectedDomain?: string;
  estimatedReadingMinutes: number;
  wordCountEstimate: number;
  pageCountEstimate?: number;
  fullRawText?: string;
  pages?: string[];
  executiveSummary: ExecutiveSummary;
  course?: GeneratedCourse;
  chapters: ChapterItem[];
  keyConcepts: KeyConceptItem[];
  activities: ActivityItem[];
  quizzes: QuizQuestion[];
  examQuestions: ExamQuestionItem[];
  glossary: GlossaryItem[];
  conceptMap: ConceptMapData;
  flashcards: FlashcardItem[];
}

export type SupportedFormat = 'PDF' | 'DOCX' | 'TXT' | 'EPUB' | 'PPTX';

export interface StoredDocumentRecord {
  id: string;
  fileName: string;
  format: SupportedFormat;
  category: string;
  processedAt: string;
  analysis: DocumentAnalysis;
}

export interface AnalysisHistoryLog {
  id: string;
  documentId: string;
  documentTitle: string;
  fileName: string;
  format: SupportedFormat;
  action: 'ANALYZED' | 'IMPORTED' | 'COURSE_GENERATED' | 'EXPORTED';
  timestamp: string;
  details: string;
}

export type EditorSection =
  | 'curso'
  | 'resumen'
  | 'capitulos'
  | 'conceptos'
  | 'mapa'
  | 'flashcards'
  | 'cuestionarios'
  | 'examen'
  | 'actividades'
  | 'glosario'
  | 'chat'
  | 'calificaciones'
  | 'busqueda'
  | 'biblioteca'
  | 'comparador'
  | 'estadisticas'
  | 'web';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citedSections?: string[];
  followUpSuggestions?: string[];
  timestamp: string;
}

export interface SemanticSearchResultItem {
  documentTitle: string;
  sectionType: string;
  title: string;
  excerpt: string;
  semanticRelevanceReason: string;
  relevancePercentage: number;
}

export interface SemanticSearchResponse {
  synthesizedAnswer: string;
  results: SemanticSearchResultItem[];
}

export interface DocumentComparisonResult {
  executiveSynthesis: string;
  complementaryStrengths: string;
  sharedThemes: string[];
  keyDifferences: {
    dimension: string;
    docAPerspective: string;
    docBPerspective: string;
  }[];
  studyRecommendation: string;
}
