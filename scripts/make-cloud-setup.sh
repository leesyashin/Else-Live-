#!/bin/bash
# Writes buero-cloud-setup.sh: a setup script for a Claude Code cloud
# environment that installs the Büro mod into ~/.claude/skills/buero, where
# every cloud session loads it. Run it again after changing the mod.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
mod="$root/.claude/skills/buero"
out="$root/buero-cloud-setup.sh"
files=(
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.tsx
  hooks/model.ts
  hooks/art.ts
  hooks/cloud.ts
  types/index.d.ts
)

{
  cat <<'HEAD'
#!/bin/bash
# Büro-Mod für Claude Code (https://github.com/leesyashin/Else-Live-)
# In die Cloud-Umgebung als Setup-Skript einfügen: Umgebungsmenü in der
# Titelleiste einer Session > Bearbeiten > Setup-Skript. Die Mod landet in
# ~/.claude/skills/buero und lädt in jeder neuen Cloud-Session dieser Umgebung.
# Erzeugt von scripts/make-cloud-setup.sh, nicht von Hand ändern.

install_buero() {
  local dir="$HOME/.claude/skills/buero"
  rm -rf "$dir"
  mkdir -p "$dir/.claude-plugin" "$dir/hooks" "$dir/types"
HEAD
  for file in "${files[@]}"; do
    if grep -q '^BUERO_DATEI_ENDE$' "$mod/$file"; then
      echo "$file contains the heredoc delimiter" >&2
      exit 1
    fi
    printf "\n  cat > \"\$dir/%s\" <<'BUERO_DATEI_ENDE'\n" "$file"
    cat "$mod/$file"
    printf 'BUERO_DATEI_ENDE\n'
  done
  cat <<'TAIL'

  echo "Büro-Mod installiert: $dir"
}

# Ein Fehler hier darf den Start der Session nie verhindern.
install_buero || echo "Büro-Mod konnte nicht installiert werden." >&2
true
TAIL
} >"$out"
chmod +x "$out"
echo "wrote $out ($(wc -c <"$out") bytes)"
