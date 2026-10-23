// GitHub-Anbindung über die REST-API mit einem Fine-grained Token.
// Rechte: Contents (lesen/schreiben, für Branch löschen), Pull requests
// (lesen/schreiben), Checks und Commit statuses (lesen).
// Der Token liegt nur im Speicher dieses Geräts und geht nur an api.github.com.

const API = 'https://api.github.com';

export class GitHubFehler extends Error {
  constructor(status, nachricht) {
    super(nachricht);
    this.status = status;
  }
}

export class GitHub {
  constructor(token) {
    this.token = token;
  }

  async anfrage(methode, pfad, inhalt) {
    const antwort = await fetch(API + pfad, {
      method: methode,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(inhalt ? { 'Content-Type': 'application/json' } : {}),
      },
      body: inhalt ? JSON.stringify(inhalt) : undefined,
      cache: 'no-store',
    });
    if (antwort.status === 204) return null;
    const daten = await antwort.json().catch(() => null);
    if (!antwort.ok) throw new GitHubFehler(antwort.status, daten?.message ?? `HTTP ${antwort.status}`);
    return daten;
  }

  ich() {
    return this.anfrage('GET', '/user');
  }

  repo(repo) {
    return this.anfrage('GET', `/repos/${repo}`);
  }

  offenePRs(repo) {
    return this.anfrage('GET', `/repos/${repo}/pulls?state=open&per_page=30`);
  }

  pr(repo, nummer) {
    return this.anfrage('GET', `/repos/${repo}/pulls/${nummer}`);
  }

  branches(repo) {
    return this.anfrage('GET', `/repos/${repo}/branches?per_page=100`);
  }

  async ci(repo, sha) {
    const [laeufe, status] = await Promise.all([
      this.anfrage('GET', `/repos/${repo}/commits/${sha}/check-runs?per_page=100`),
      this.anfrage('GET', `/repos/${repo}/commits/${sha}/status`),
    ]);
    return ciAuswerten(laeufe?.check_runs ?? [], status?.statuses ?? []);
  }

  prErstellen(repo, { titel, head, base, text }) {
    return this.anfrage('POST', `/repos/${repo}/pulls`, { title: titel, head, base, body: text });
  }

  // sha sorgt dafür, dass nur genau der geprüfte Stand gemergt wird.
  squashMerge(repo, nummer, sha) {
    return this.anfrage('PUT', `/repos/${repo}/pulls/${nummer}/merge`, { merge_method: 'squash', sha });
  }

  branchLoeschen(repo, branch) {
    return this.anfrage('DELETE', `/repos/${repo}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
  }
}

const ROT = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

// Fasst Check-Runs und klassische Commit-Status zu einem Stand zusammen:
// { ci: 'gruen' | 'rot' | 'laeuft' | 'keine', fertig, gesamt, rot: [Namen] }
export function ciAuswerten(laeufe, statuse) {
  const posten = [];
  for (const lauf of laeufe) {
    if (lauf.status !== 'completed') posten.push({ name: lauf.name, stand: 'laeuft' });
    else posten.push({ name: lauf.name, stand: ROT.has(lauf.conclusion) ? 'rot' : 'gruen' });
  }
  for (const s of statuse) {
    posten.push({ name: s.context, stand: s.state === 'pending' ? 'laeuft' : s.state === 'success' ? 'gruen' : 'rot' });
  }
  const gesamt = posten.length;
  const fertig = posten.filter((p) => p.stand !== 'laeuft').length;
  const rot = posten.filter((p) => p.stand === 'rot').map((p) => p.name);
  let ci = 'keine';
  if (rot.length) ci = 'rot';
  else if (gesamt && fertig < gesamt) ci = 'laeuft';
  else if (gesamt) ci = 'gruen';
  return { ci, fertig, gesamt, rot };
}

// Aus "claude/dark-mode-einstellungen-x7Kq" wird "Dark mode einstellungen".
export function titelAusBranch(branch) {
  // Die Cloud hängt eine Kennung mit Großbuchstaben und Ziffern an.
  const teil = branch.replace(/^claude\//, '').replace(/-(?=[a-z0-9]*[A-Z])(?=[A-Za-z]*[0-9])[A-Za-z0-9]{4,8}$/, '');
  const text = teil.replace(/[-_/]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : branch;
}
