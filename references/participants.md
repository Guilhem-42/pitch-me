# Dépôts des autres participants

Registre des dépôts **publics** découverts pendant l'événement (autres équipes, organisateurs,
partenaires). Le registre est versionné ; les sources, elles, sont clonées à la demande dans
`references/_clones/` (ignoré par git) avec `references/fetch.sh`.

## Règles

- **Lecture seule.** On étudie, on s'inspire, on ne copie pas de code sans licence explicite.
- **Pas de licence = tous droits réservés.** Colonne « Réutilisable » : `non` par défaut.
- **Épingler un SHA** pour les dépôts importants : un dépôt peut être modifié ou supprimé après l'événement.
- Un dépôt vraiment précieux ? Le forker (`gh repo fork --clone=false`) : le fork survit à l'original.

## Registre

Une ligne par dépôt, URL complète en première colonne (c'est ce que lit `fetch.sh`).

| Dépôt | Équipe / auteur | Pourquoi on le garde | Licence | Réutilisable ? | SHA épinglé |
|---|---|---|---|---|---|
| https://github.com/&lt;owner&gt;/&lt;repo&gt; | `<équipe>` | `<idée, technique, outil>` | `<licence ou aucune>` | `oui / non / avec attribution` | `<7 à 40 car., facultatif>` |

> Ligne d'exemple (ignorée par `fetch.sh`, car l'URL ne commence pas par `https://github.com/<owner>`
> valide) : remplacer par les vrais dépôts.
