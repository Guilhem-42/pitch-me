import { z } from 'zod';

// Schéma pour les repères
export const RepereSchema = z.object({
  t: z.string().datetime(), // ISO 8601
  type: z.enum(['pret', 'blocage', 'ok', 'note']),
  texte: z.string()
});

// Schéma pour les éléments de checklist
export const ChecklistItemSchema = z.object({
  id: z.string(),
  texte: z.string(),
  fait: z.boolean()
});

// Schéma pour les fenêtres prévues
export const FenetrePrevueSchema = z.object({
  app: z.string(),
  motif: z.string()
});

// Schéma pour le manifeste
export const ManifestSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-s\d{2}$/), // Format AAAA-MM-JJ-sNN
  titre: z.string(),
  objectif: z.string(),
  criteres: z.array(z.string()),
  duree_cible_s: z.number().positive(),
  fenetres_prevues: z.array(FenetrePrevueSchema),
  audio: z.boolean(),
  session_precedente: z.string().nullable(),
  checklist: z.array(ChecklistItemSchema),
  reperes: z.array(RepereSchema),
  debut: z.string().datetime().nullable(),
  pret: z.string().datetime().nullable(),
  fin: z.string().datetime().nullable(),
  statut: z.enum(['preparation', 'live', 'termine', 'analyse'])
});

// Schéma pour une fenêtre dans la timeline
export const FenetreTimelineSchema = z.object({
  app: z.string(),
  fenetre: z.string(),
  debut_s: z.number(),
  fin_s: z.number(),
  duree_s: z.number(),
  prevue: z.boolean()
});

// Schéma pour le temps par app
export const TempsParAppSchema = z.object({
  app: z.string(),
  duree_s: z.number(),
  part: z.number()
});

// Schéma pour hors cadre
export const HorsCadreSchema = z.object({
  app: z.string(),
  fenetre: z.string(),
  debut_s: z.number(),
  fin_s: z.number(),
  duree_s: z.number()
});

// Schéma pour les silences
export const SilenceSchema = z.object({
  debut_s: z.number(),
  fin_s: z.number(),
  duree_s: z.number()
});

// Schéma pour les données de parole
export const ParoleSchema = z.object({
  duree_s: z.number(),
  mots: z.number().int(),
  mots_par_min: z.number()
});

// Schéma pour les extraits de texte
export const ExtraitTexteSchema = z.object({
  t_s: z.number(),
  app: z.string(),
  texte: z.string().max(300)
});

// Schéma pour la timeline
export const TimelineSchema = z.object({
  session_id: z.string(),
  debut: z.string().datetime(),
  pret: z.string().datetime(),
  fin: z.string().datetime(),
  duree_s: z.number(),
  duree_preparation_s: z.number(),
  duree_live_s: z.number(),
  fenetres: z.array(FenetreTimelineSchema),
  temps_par_app: z.array(TempsParAppSchema),
  changements_fenetre: z.number().int(),
  hors_cadre: z.array(HorsCadreSchema),
  silences: z.array(SilenceSchema).optional(),
  parole: ParoleSchema.optional(),
  reperes: z.array(z.object({
    t_s: z.number(),
    type: z.string(),
    texte: z.string()
  })),
  extraits_texte: z.array(ExtraitTexteSchema).max(40)
});

// Schéma pour les preuves dans le rapport
export const PreuveSchema = z.object({
  source: z.string(),
  t_s: z.number()
});

// Schéma pour les constats
export const ConstatSchema = z.object({
  titre: z.string(),
  detail: z.string(),
  gravite: z.enum(['info', 'attention', 'bloquant']),
  preuve: PreuveSchema
});

// Schéma pour les recommandations
export const RecommandationSchema = z.object({
  id: z.string(),
  texte: z.string(),
  priorite: z.number().int().min(1).max(3)
});

// Schéma pour les deltas de comparaison
export const DeltaSchema = z.object({
  mesure: z.string(),
  avant: z.number(),
  apres: z.number()
});

// Schéma pour la comparaison
export const ComparaisonSchema = z.object({
  avec: z.string(),
  deltas: z.array(DeltaSchema)
}).nullable();

// Schéma pour les TODOs détectés
export const TodoDetecteSchema = z.object({
  texte: z.string(),
  source: z.string()
});

// Schéma pour le rapport
export const ReportSchema = z.object({
  session_id: z.string(),
  resume: z.string(),
  objectif_atteint: z.object({
    verdict: z.enum(['oui', 'partiel', 'non']),
    justification: z.string()
  }),
  constats: z.array(ConstatSchema),
  recommandations: z.array(RecommandationSchema),
  checklist_suivante: z.array(ChecklistItemSchema),
  comparaison: ComparaisonSchema,
  todo_detectes: z.array(TodoDetecteSchema),
  incertitudes: z.array(z.string())
});
