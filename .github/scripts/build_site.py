#!/usr/bin/env python3
"""Build the website pages that are written in Markdown.

Sources
  web/pages/*.md    standalone pages (terms, privacy, delete-account)
  web/help/*.md     the help centre, one article per file (index.md is the intro)
  CHANGELOG.md      release notes

Output (written into site/, ignored by git, produced again on every deploy)
  terms.html, privacy.html, delete-account.html, changelog.html, changelog.json,
  help/index.html, help/<article>.html, sitemap.xml

Only the Python standard library is used. Run it from anywhere:
  python3 .github/scripts/build_site.py
"""
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
WEB = ROOT / "web"
BASE = "https://priyanshuiitghy2006.github.io/AttendWise/"
PATH = "/AttendWise/"
OG_IMAGE = BASE + "img/og.jpg"
ISSUES = "https://github.com/PriyanshuIITGHY2006/AttendWise/issues"
EMAIL = "priyanshuib01@gmail.com"


# ---------------------------------------------------------------- Markdown

def split_front(text, name):
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    if not m:
        sys.exit(f"{name}: missing front matter")
    meta = {}
    for line in m.group(1).splitlines():
        if line.strip():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta, m.group(2)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])", r"<em>\1</em>", s)

    def link(m):
        url = m.group(2)
        extra = ' rel="noopener"' if url.startswith("http") else ""
        return f'<a href="{html.escape(url, quote=True)}"{extra}>{m.group(1)}</a>'

    return re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)


def plain(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(s))).strip()


def render(md, headings=None):
    """Render the small Markdown subset used by the website sources."""
    lines = md.strip("\n").splitlines()
    out, para, i = [], [], 0

    def flush():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            flush()
            i += 1
            continue
        if stripped.startswith(":::") and len(stripped) > 3:
            flush()
            kind = stripped[3:].strip()
            j = i + 1
            while j < len(lines) and lines[j].strip() != ":::":
                j += 1
            inner = render("\n".join(lines[i + 1:j]), headings)
            if kind == "short":
                out.append(f'<div class="glass short">{inner}</div>')
            else:
                out.append(f'<div class="callout {html.escape(kind)}">{inner}</div>')
            i = j + 1
            continue
        m = re.match(r"(#{2,3}) (.+)", stripped)
        if m:
            flush()
            level, text = len(m.group(1)), m.group(2)
            if headings is not None:
                headings.append((level, text))
            out.append(f'<h{level} id="{slug(text)}">{inline(text)}</h{level}>')
            i += 1
            continue
        if re.match(r"- ", stripped):
            flush()
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(lines[i].strip()[2:])
                i += 1
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ul>")
            continue
        if re.match(r"\d+\. ", stripped):
            flush()
            items = []
            while i < len(lines) and re.match(r"\d+\. ", lines[i].strip()):
                items.append(re.sub(r"^\d+\. ", "", lines[i].strip()))
                i += 1
            out.append("<ol>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ol>")
            continue
        if stripped.startswith("|"):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[2:]]
            t = "<div class=\"tablewrap\"><table><thead><tr>"
            t += "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            for r in body:
                t += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
            out.append(t + "</tbody></table></div>")
            continue
        para.append(stripped)
        i += 1
    flush()
    return "\n".join(out)


# ------------------------------------------------------------------- Shell

def fmt_date(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"


def shell(title, description, rel, body, crumbs=None, jsonld=None, wide=False, robots="index, follow"):
    url = BASE + rel
    full_title = title if "AttendWise" in title else f"{title} | AttendWise"
    ld = ""
    blocks = list(jsonld or [])
    if crumbs:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": n + 1, "name": name, "item": BASE + href}
                for n, (name, href) in enumerate(crumbs)
            ],
        })
    for b in blocks:
        ld += '<script type="application/ld+json">\n' + json.dumps(b, indent=2, ensure_ascii=False) + "\n</script>\n"
    esc = lambda s: html.escape(s, quote=True)
    wrap = "wrap wide" if wide else "wrap"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{url}">
<meta name="author" content="Priyanshu Debnath">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f2f5fb" media="(prefers-color-scheme: light)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AttendWise">
<meta property="og:locale" content="en">
<meta property="og:title" content="{esc(full_title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{esc(full_title)}">
<meta name="twitter:description" content="{esc(description)}">
<link rel="icon" href="{PATH}favicon.svg" type="image/svg+xml">
<link rel="icon" href="{PATH}img/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="{PATH}img/apple-touch-icon.png">
<link rel="preload" href="{PATH}fonts/questrial-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{PATH}fonts/hind-300.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{PATH}css/page.css">
{ld}</head>
<body>
<div class="{wrap}">
  <header class="top">
    <a class="brand" href="{PATH}"><img src="{PATH}favicon.svg" alt="" width="40" height="40">AttendWise</a>
    <nav class="nav" aria-label="Site">
      <a href="{PATH}help/">Help</a>
      <a class="hide-sm" href="{PATH}changelog.html">Changelog</a>
      <a class="pill" href="{PATH}#download">Download</a>
    </nav>
  </header>
  <main>
{body}
  </main>
</div>
<footer>
  <div class="{wrap}">
    <a href="{PATH}">Home</a>
    <a href="{PATH}help/">Help</a>
    <a href="{PATH}changelog.html">Changelog</a>
    <a href="{PATH}privacy.html">Privacy</a>
    <a href="{PATH}terms.html">Terms</a>
    <a href="{ISSUES}" rel="noopener">Report a problem</a>
    <a href="https://github.com/PriyanshuIITGHY2006/AttendWise/releases" rel="noopener">All releases</a>
  </div>
</footer>
<script>
  // Turn off the old website's offline cache so returning visitors see this page.
  if ('serviceWorker' in navigator) {{
    navigator.serviceWorker.getRegistrations().then(function (rs) {{ rs.forEach(function (r) {{ r.unregister(); }}); }}).catch(function () {{}});
  }}
  if (window.caches) caches.keys().then(function (ks) {{ ks.forEach(function (k) {{ caches.delete(k); }}); }}).catch(function () {{}});
</script>
</body>
</html>
"""


def write(rel, content):
    target = SITE / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


# ------------------------------------------------------------------- Pages

def build_pages(sitemap):
    for src in sorted((WEB / "pages").glob("*.md")):
        meta, md = split_front(src.read_text(encoding="utf-8"), src.name)
        rel = src.stem + ".html"
        updated = f'<p class="updated">Last updated {fmt_date(meta["updated"])}</p>' if "updated" in meta else ""
        body = f'<h1>{html.escape(meta["title"])}</h1>\n{updated}\n{render(md)}'
        write(rel, shell(meta["title"], meta["description"], rel, body,
                         crumbs=[("Home", ""), (meta["title"], rel)]))
        sitemap.append((rel, meta.get("updated"), "0.3"))


def build_help(sitemap):
    articles = []
    for src in sorted((WEB / "help").glob("*.md")):
        meta, md = split_front(src.read_text(encoding="utf-8"), src.name)
        if src.stem == "index":
            intro = (meta, md)
            continue
        articles.append((src.stem, meta, md))
    articles.sort(key=lambda a: int(a[1].get("order", 99)))

    for stem, meta, md in articles:
        heads = []
        content = render(md, heads)
        rel = f"help/{stem}.html"
        updated = f'<p class="updated">Last updated {fmt_date(meta["updated"])}</p>' if "updated" in meta else ""
        crumbs_html = (f'<nav class="crumbs" aria-label="Breadcrumb"><a href="{PATH}help/">Help</a>'
                       f' <span aria-hidden="true">/</span> <span>{html.escape(meta["title"])}</span></nav>')
        idx = [i for i, a in enumerate(articles) if a[0] == stem][0]
        nav = '<nav class="pager" aria-label="More help articles">'
        if idx > 0:
            p = articles[idx - 1]
            nav += f'<a class="prev" href="{PATH}help/{p[0]}.html"><span>Previous</span>{html.escape(p[1]["title"])}</a>'
        if idx < len(articles) - 1:
            n = articles[idx + 1]
            nav += f'<a class="next" href="{PATH}help/{n[0]}.html"><span>Next</span>{html.escape(n[1]["title"])}</a>'
        nav += "</nav>"
        more = (f'<p class="muted">Still stuck? Email <a href="mailto:{EMAIL}">{EMAIL}</a> '
                f'or <a href="{ISSUES}" rel="noopener">open an issue on GitHub</a>.</p>')
        body = f'{crumbs_html}\n<h1>{html.escape(meta["title"])}</h1>\n{updated}\n{content}\n{more}\n{nav}'
        jsonld = []
        if meta.get("faq") == "true":
            qa = []
            for m in re.finditer(r"<h3 id=\"[^\"]*\">(.*?)</h3>(.*?)(?=<h3 |\Z)", content, re.S):
                qa.append({"@type": "Question", "name": plain(m.group(1)),
                           "acceptedAnswer": {"@type": "Answer", "text": plain(m.group(2))}})
            jsonld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": qa})
        write(rel, shell(meta["title"], meta["description"], rel, body,
                         crumbs=[("Home", ""), ("Help", "help/"), (meta["title"], rel)], jsonld=jsonld))
        sitemap.append((rel, meta.get("updated"), "0.6"))

    # Index with live search over the article list.
    meta, md = intro
    cards = ""
    for stem, m, text in articles:
        hay = html.escape(plain(f"{m['title']} {m['description']} {render(text)}").lower()[:2500], quote=True)
        cards += (f'<li class="card" data-text="{hay}"><a href="{PATH}help/{stem}.html">'
                  f'<strong>{html.escape(m["title"])}</strong><span>{html.escape(m["description"])}</span></a></li>\n')
    search = f"""<div class="search">
  <label for="q">Search the help</label>
  <input id="q" type="search" placeholder="For example: reminders, update, safe skips" autocomplete="off">
</div>
<ul class="cards" id="cards">
{cards}</ul>
<p id="none" class="muted" hidden>Nothing matches that. Try a different word, or email <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
<script>
  (function () {{
    var q = document.getElementById('q'), cards = document.querySelectorAll('#cards .card'), none = document.getElementById('none');
    q.addEventListener('input', function () {{
      var words = q.value.toLowerCase().split(/\\s+/).filter(Boolean), shown = 0;
      Array.prototype.forEach.call(cards, function (c) {{
        var ok = words.every(function (w) {{ return c.getAttribute('data-text').indexOf(w) !== -1; }});
        c.hidden = !ok; if (ok) shown++;
      }});
      none.hidden = shown !== 0;
    }});
  }})();
</script>"""
    body = f'<h1>{html.escape(meta["title"])}</h1>\n{render(md)}\n{search}'
    write("help/index.html", shell(meta["title"], meta["description"], "help/", body,
                                   crumbs=[("Home", ""), ("Help", "help/")], wide=True))
    sitemap.append(("help/", meta.get("updated"), "0.8"))


# --------------------------------------------------------------- Changelog

def build_changelog(sitemap):
    text = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    parts = re.split(r"(?m)^## (\S+) - (\d{4}-\d{2}-\d{2})\s*$", text)
    intro_md = re.sub(r"(?m)^# .*\n", "", parts[0]).strip()
    releases = []
    for k in range(1, len(parts), 3):
        version, day, md = parts[k], parts[k + 1], parts[k + 2].strip()
        sections, summary, cur = {}, [], None
        for line in md.splitlines():
            if line.startswith("### "):
                cur = line[4:].strip()
                sections[cur] = []
            elif line.startswith("- ") and cur:
                sections[cur].append(line[2:].strip())
            elif line.strip() and cur is None:
                summary.append(line.strip())
        releases.append({"version": version, "date": day, "summary": " ".join(summary), "sections": sections, "md": md})
    body = '<h1>Changelog</h1>\n' + render(intro_md) + "\n"
    for r in releases:
        body += (f'<article class="release" id="v{slug(r["version"])}">\n'
                 f'<h2>{html.escape(r["version"])} <time datetime="{r["date"]}">{fmt_date(r["date"])}</time></h2>\n'
                 f'{render(r["md"])}\n</article>\n')
    latest = releases[0]
    write("changelog.html", shell("Changelog", "What changed in each AttendWise version, newest first.", "changelog.html", body,
                                  crumbs=[("Home", ""), ("Changelog", "changelog.html")]))
    write("changelog.json", json.dumps({
        "latest": {"version": latest["version"], "date": latest["date"]},
        "releases": [{k: r[k] for k in ("version", "date", "summary", "sections")} for r in releases],
    }, indent=2, ensure_ascii=False) + "\n")
    sitemap.append(("changelog.html", latest["date"], "0.5"))


# ----------------------------------------------------------------- Sitemap

def build_sitemap(entries):
    rows = [("", None, "1.0")] + entries
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for rel, last, prio in rows:
        xml += f"  <url>\n    <loc>{BASE}{rel}</loc>\n"
        if last:
            xml += f"    <lastmod>{last}</lastmod>\n"
        xml += f"    <priority>{prio}</priority>\n  </url>\n"
    write("sitemap.xml", xml + "</urlset>\n")


def main():
    sitemap = []
    build_pages(sitemap)
    build_help(sitemap)
    build_changelog(sitemap)
    build_sitemap(sitemap)
    print(f"built {len(sitemap) + 1} pages")


if __name__ == "__main__":
    main()
