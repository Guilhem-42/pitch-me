#!/usr/bin/env bash
# Clone (ou met à jour) les dépôts listés dans references/participants.md
# vers references/_clones/<owner>__<repo>  (dossier ignoré par git).
#
#   ./references/fetch.sh            clone les dépôts manquants (shallow)
#   ./references/fetch.sh --update   met aussi à jour les dépôts déjà clonés
#   ./references/fetch.sh --shas     affiche le SHA courant de chaque clone (pour la colonne « SHA épinglé »)
#
# Si une ligne a un SHA épinglé, le clone est positionné sur ce commit.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$HERE/participants.md"
DEST="$HERE/_clones"
MODE="${1:-fetch}"

[ -f "$REGISTRY" ] || { echo "Registre introuvable : $REGISTRY" >&2; exit 1; }
mkdir -p "$DEST"

# Lignes de tableau dont la 1re colonne est une URL GitHub valide → "url<TAB>sha"
rows() {
  awk -F'|' '
    function trim(s) { gsub(/^[ \t`]+|[ \t`]+$/, "", s); return s }
    /^\|/ {
      url = trim($2); sha = trim($7)
      if (url ~ /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) {
        if (sha !~ /^[0-9a-f]{7,40}$/) sha = ""
        print url "\t" sha
      }
    }' "$REGISTRY"
}

count=0
while IFS=$'\t' read -r url sha; do
  [ -n "$url" ] || continue
  count=$((count + 1))
  slug="${url#https://github.com/}"; slug="${slug%.git}"
  dir="$DEST/${slug/\//__}"

  case "$MODE" in
    --shas)
      if [ -d "$dir/.git" ]; then
        printf '%s  %s\n' "$(git -C "$dir" rev-parse --short=12 HEAD)" "$slug"
      else
        printf '%-12s  %s (non cloné)\n' "-" "$slug"
      fi
      continue ;;
  esac

  if [ -d "$dir/.git" ]; then
    if [ "$MODE" = "--update" ] && [ -z "$sha" ]; then
      echo "↻ $slug"
      git -C "$dir" pull --ff-only --depth 1 --quiet || echo "  ! mise à jour impossible (dépôt modifié ou supprimé ?)" >&2
    else
      echo "✓ $slug (déjà là)"
    fi
    continue
  fi

  echo "↓ $slug"
  if [ -n "$sha" ]; then
    git init --quiet "$dir"
    git -C "$dir" remote add origin "$url.git"
    if git -C "$dir" fetch --quiet --depth 1 origin "$sha" && git -C "$dir" checkout --quiet FETCH_HEAD; then
      echo "  épinglé sur $sha"
    else
      echo "  ! SHA $sha introuvable : dépôt réécrit ou supprimé ?" >&2
      rm -rf "$dir"
    fi
  else
    git clone --quiet --depth 1 "$url.git" "$dir" || echo "  ! clonage impossible (dépôt privé ou supprimé ?)" >&2
  fi
done < <(rows)

[ "$count" -gt 0 ] || echo "Aucun dépôt dans $REGISTRY (ajoute une ligne au tableau)."
