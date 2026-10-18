---
titre: Backlog de Pitch-Me
type: notes
date: 2026-10-18
---

# Backlog de Pitch-Me

Idées retenues mais hors du périmètre actuel. Une entrée par chantier. Un chantier
qui démarre passe dans `docs/DECISIONS.md` s'il engage l'architecture.

## Changer de modèle depuis le dashboard

**Besoin :** comparer plusieurs modèles sur la même session (tests de prompt, de
coût, de qualité) sans modifier `.env` ni relancer le wrapper.

**Pistes :**

1. **Tracer le modèle utilisé.** Ajouter un champ `modele` dans `report.json`
   (identifiant du modèle ayant produit le bilan). Sans lui, deux bilans de la
   même session ne se comparent pas. Petite modification, à faire en premier.
2. **Menu de modèles.** Liste déroulante alimentée par une variable
   `ANTHROPIC_MODELS` (identifiants séparés par des virgules). `ANTHROPIC_MODEL`
   reste le modèle par défaut et reste obligatoire.
3. **Relancer un bilan avec un autre modèle** sans écraser le précédent :
   conserver un rapport par modèle (par exemple `report.<modele>.json`) et
   afficher leurs différences dans le dashboard.
4. **Saisie d'une clé d'API dans le dashboard.** Contraintes de sécurité :
   - la clé reste en mémoire du serveur, jamais écrite sur disque, jamais dans
     `sessions/`, jamais dans git ;
   - l'API du serveur ne la renvoie jamais, le champ n'affiche rien en clair
     après validation ;
   - le serveur écoute uniquement sur `127.0.0.1` (déjà le cas).
5. **Autres fournisseurs que Anthropic.** À décider : le code utilise le SDK
   d'Anthropic. Accepter d'autres fournisseurs demande une petite couche
   d'adaptation (une interface commune pour l'appel au modèle). Pour comparer
   des modèles Claude entre eux, les pistes 1 à 4 suffisent.

**Statut :** à faire après la première session de test. Décision de périmètre
(piste 5 incluse ou non) à prendre par un humain de l'équipe.
