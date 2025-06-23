import * as cheerio from "cheerio";

import { minify } from "html-minifier-terser";

import { mkdir } from "fs/promises";
import { dirname, join } from "path";

const baseUrl = `https://waifustation.miku-royal.ts.net/`;
const pages = ["/portainer", "/tea", "/", "/tea/dragsbruh/proxii"];
const outdir = "dist";

const template = await Bun.file(join(__dirname, "template.html")).text();

type MetaData = {
  title: string | null;
  metaTags: Record<string, string | undefined>[];
  favicon: string | null;
};

async function scrapeMeta(url: URL): Promise<MetaData> {
  try {
    const res = await fetch(url);

    const $ = cheerio.load(await res.text());
    const title = $("title").text().trim() || null;
    const metaTags: Record<string, string | undefined>[] = [];
    $("meta").each((_, el) => {
      const attribs = el.attribs;
      metaTags.push({ ...attribs });
    });

    let favicon: string | null = null;
    const rels = ["icon", "shortcut icon", "apple-touch-icon"];
    for (const rel of rels) {
      const link = $(`link[rel~="${rel}"]`).attr("href");
      if (link) {
        favicon = new URL(link, url).href;
        break;
      }
    }

    return { title, metaTags, favicon };
  } catch (err) {
    console.error("[!] Error scraping:", err);
    return { title: null, metaTags: [], favicon: null };
  }
}

function renderMetaTags(metaTags: MetaData["metaTags"]): string[] {
  return metaTags.map((tag) => {
    const attributes = Object.entries(tag)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        const escaped = value!.replace(/"/g, "&quot;");
        return `${key}="${escaped}"`;
      })
      .join(" ");

    return `<meta ${attributes} />`;
  });
}

function makeTemplate(data: MetaData) {
  return template.replace(
    "<header-tags />",
    [
      `<title>${data.title}</title>`,
      `<link rel="icon" href="${data.favicon}" />`,
      ...renderMetaTags(data.metaTags),
    ].join("\n")
  );
}

async function makedirs(...components: string[]) {
  try {
    await mkdir(join(...components));
  } catch (e) {}
}

makedirs(outdir);

for (const page of pages) {
  const path = join(
    outdir,
    ...(page.startsWith("/") ? page.slice(1) : page).split("/"),
    "404.html"
  );
  await makedirs(dirname(path));

  const meta = await scrapeMeta(new URL(page, baseUrl));
  const html = makeTemplate(meta);

  const minifiedHtml = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  });

  await Bun.file(path).write(minifiedHtml);
}
