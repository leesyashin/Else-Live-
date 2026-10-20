#!/bin/bash
# Writes buero-cloud-setup.sh: a setup script for a Claude Code cloud
# environment that installs the Büro mod into ~/.claude/skills/buero, where
# every cloud session loads it. The script first tries to fetch the newest mod
# from main on GitHub (the cloud's proxy allows that only in sessions whose
# own repository is Else-Live-, the Chef vom Dienst among them) and falls back
# to the copy embedded here. Run it again after changing the mod.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
mod="$root/.claude/skills/buero"
out="$root/buero-cloud-setup.sh"
version="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$mod/.claude-plugin/plugin.json" | head -1 | grep -oE '[0-9][^"]*')"
files=(
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.tsx
  hooks/model.ts
  hooks/art.ts
  hooks/cloud.ts
  hooks/post.ts
  hooks/db.ts
  hooks/auftraege.ts
  hooks/besprechung.ts
  hooks/dienst.ts
  types/index.d.ts
)

{
  cat <<HEAD
#!/bin/bash
# Büro-Mod für Claude Code (https://github.com/leesyashin/Else-Live-), eingebettet: Version $version
# In die Cloud-Umgebung als Setup-Skript einfügen: Umgebungsmenü in der
# Titelleiste einer Session > Bearbeiten > Setup-Skript. Die Mod landet in
# ~/.claude/skills/buero und lädt in jeder neuen Cloud-Session dieser Umgebung.
# Zuerst holt das Skript die neueste Mod von main auf GitHub; das gelingt nur in
# Sessions, deren eigenes Repo Else-Live- ist (etwa beim Chef vom Dienst), weil
# die Cloud pro Session nur das eigene Repo freigibt. Sonst installiert es die
# hier eingebettete Kopie.
# Erzeugt von scripts/make-cloud-setup.sh, nicht von Hand ändern.

install_buero_from_github() {
  local dir="\$HOME/.claude/skills/buero"
  local tmp
  tmp="\$(mktemp -d 2>/dev/null)" || return 1
  if ! curl -fsSL --max-time 40 -H "Accept: application/vnd.github+json" \\
      "https://api.github.com/repos/leesyashin/Else-Live-/tarball/main" -o "\$tmp/buero.tgz" 2>/dev/null; then
    rm -rf "\$tmp"
    return 1
  fi
  if ! tar -xzf "\$tmp/buero.tgz" -C "\$tmp" 2>/dev/null; then
    rm -rf "\$tmp"
    return 1
  fi
  local src
  src="\$(find "\$tmp" -mindepth 4 -maxdepth 5 -type d -path '*/.claude/skills/buero' 2>/dev/null | head -1)"
  if [ -z "\$src" ] || [ ! -f "\$src/.claude-plugin/plugin.json" ] || [ ! -f "\$src/hooks/register.tsx" ]; then
    rm -rf "\$tmp"
    return 1
  fi
  rm -rf "\$dir"
  mkdir -p "\$dir"
  cp -R "\$src/." "\$dir/"
  rm -rf "\$dir/tests" "\$dir/seite" "\$dir/.claude-plugin/types" "\$dir/vorschau.png" "\$dir/vorschau-cloud.png"
  rm -rf "\$tmp"
  echo "Büro-Mod von GitHub (main) installiert: \$dir"
}

install_buero() {
  local dir="\$HOME/.claude/skills/buero"
  rm -rf "\$dir"
  mkdir -p "\$dir/.claude-plugin" "\$dir/hooks" "\$dir/types"
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

  echo "Büro-Mod (eingebettet) installiert: $dir"
}

# Ein Fehler hier darf den Start der Session nie verhindern.
install_buero_from_github || install_buero || echo "Büro-Mod konnte nicht installiert werden." >&2
true
TAIL
} >"$out"
chmod +x "$out"
echo "wrote $out ($(wc -c <"$out") bytes, version $version)"
